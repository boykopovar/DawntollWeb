export class PeerTransport extends EventTarget {
  #peer;
  #channel;
  #timer;
  constructor(configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] }) {
    super();
    this.#peer = new RTCPeerConnection(configuration);
    this.#peer.addEventListener('connectionstatechange', () => {
      const state = this.#peer.connectionState;
      if (['connected', 'failed', 'closed'].includes(state)) clearTimeout(this.#timer);
      this.dispatchEvent(new CustomEvent('state', { detail: state }));
    });
    this.#peer.addEventListener('datachannel', event => {
      if (this.#channel || event.channel.label !== 'dawntoll.control.v1') { event.channel.close(); return; }
      this.#bind(event.channel);
    });
  }
  #bind(channel) {
    this.#channel = channel;
    channel.addEventListener('open', () => this.dispatchEvent(new Event('open')));
    channel.addEventListener('close', () => this.dispatchEvent(new CustomEvent('state', { detail: 'closed' })));
    channel.addEventListener('message', event => this.dispatchEvent(new CustomEvent('message', { detail: event.data })));
  }
  async #gather(description) {
    await this.#peer.setLocalDescription(description);
    if (this.#peer.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Не удалось собрать сетевые адреса. Повторите создание сессии.')); }, 15000);
      const check = () => { if (this.#peer.iceGatheringState === 'complete') { cleanup(); resolve(); } };
      const cleanup = () => { clearTimeout(timeout); this.#peer.removeEventListener('icegatheringstatechange', check); };
      this.#peer.addEventListener('icegatheringstatechange', check);
      check();
    });
    return this.#peer.localDescription;
  }
  async offer() {
    this.#bind(this.#peer.createDataChannel('dawntoll.control.v1', { ordered: true }));
    return this.#gather(await this.#peer.createOffer());
  }
  async answer(description) {
    await this.#peer.setRemoteDescription(description);
    const result = await this.#gather(await this.#peer.createAnswer());
    return result;
  }
  async accept(description) {
    await this.#peer.setRemoteDescription(description);
    this.#watch();
  }
  #watch() {
    if (this.#peer.connectionState === 'connected') return;
    this.#timer = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('state', { detail: 'failed' }));
      this.#peer.close();
    }, 45000);
  }
  send(payload) {
    if (this.#channel?.readyState !== 'open') throw new Error('Соединение ещё не открыто.');
    if (this.#channel.bufferedAmount > 65536) throw new Error('Канал занят. Попробуйте через секунду.');
    this.#channel.send(payload);
  }
  get isOpen() { return this.#channel?.readyState === 'open'; }
  close() { clearTimeout(this.#timer); this.#channel?.close(); this.#peer.close(); }
}
