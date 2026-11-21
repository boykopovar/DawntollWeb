import { PeerTransport } from '../network/peer-transport.js';
import { encodeSignal, decodeSignal } from '../network/signaling.js';
import { createMessage, parseMessage } from './chat-protocol.js';

export class Session extends EventTarget {
  #transport;
  #id;
  #role;
  #accepted = false;
  #ready = false;
  #seen = new Set();
  #emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  #start(role, id) {
    this.close();
    this.#role = role;
    this.#id = id;
    const transport = new PeerTransport();
    this.#transport = transport;
    transport.addEventListener('state', event => {
      if (transport !== this.#transport) return;
      if (event.detail === 'connected') return;
      if (event.detail !== 'connected') this.#ready = false;
      this.#emit('state', event.detail);
    });
    transport.addEventListener('open', () => { this.#ready = true; this.#emit('state', 'connected'); });
    transport.addEventListener('message', event => {
      const message = parseMessage(event.detail);
      if (!message || this.#seen.has(message.id)) return;
      this.#remember(message.id);
      this.#emit('message', { ...message, local: false });
    });
    this.#emit('state', 'gathering');
  }
  #remember(id) {
    this.#seen.add(id);
    if (this.#seen.size > 300) this.#seen.delete(this.#seen.values().next().value);
  }
  async host() {
    this.#start('host', crypto.randomUUID());
    return encodeSignal(await this.#transport.offer(), this.#id);
  }
  async join(input) {
    const signal = await decodeSignal(input);
    if (signal.type !== 'offer') throw new Error('Гостю нужно приглашение хоста, а не ответ.');
    this.#start('guest', signal.sessionId);
    return encodeSignal(await this.#transport.answer({ type: signal.type, sdp: signal.sdp }), this.#id);
  }
  async accept(input) {
    const signal = await decodeSignal(input);
    if (this.#role !== 'host' || this.#accepted || signal.type !== 'answer' || signal.sessionId !== this.#id) throw new Error('Нужен ответ гостя для текущего приглашения.');
    await this.#transport.accept({ type: signal.type, sdp: signal.sdp });
    this.#accepted = true;
    if (!this.#ready) this.#emit('state', 'connecting');
  }
  send(text) {
    const message = createMessage(text);
    this.#transport?.send(JSON.stringify(message));
    if (!this.#transport) throw new Error('Создайте соединение.');
    this.#remember(message.id);
    this.#emit('message', { ...message, local: true });
  }
  close() {
    const transport = this.#transport;
    this.#transport = null;
    transport?.close();
    this.#accepted = false;
    this.#ready = false;
    this.#seen.clear();
    this.#emit('state', 'idle');
  }
}
