import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSignal, decodeSignal, signalLink } from '../web/src/network/signaling.js';
import { createMessage, parseMessage } from '../web/src/session/chat-protocol.js';

test('compressed signaling round trip through a project URL', async () => {
  const id = crypto.randomUUID();
  const description = { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:example\r\n' };
  const token = await encodeSignal(description, id);
  const url = signalLink(token, { origin: 'https://example.org', pathname: '/DawntollWeb/' });
  assert.deepEqual(await decodeSignal(url), { v: 1, sessionId: id, ...description });
});
test('invalid and oversized invitations are rejected', async () => {
  for (const input of ['', 'not a link', 'a'.repeat(24001), 'hello']) await assert.rejects(decodeSignal(input));
  await assert.rejects(decodeSignal(await encodeSignal({ type: 'answer', sdp: 'x'.repeat(30000) }, crypto.randomUUID())));
});
test('chat wire protocol validates text, version and size', () => {
  const message = createMessage(' <img onerror=alert(1)> Привет 🌅 ');
  assert.equal(parseMessage(JSON.stringify(message)).text, '<img onerror=alert(1)> Привет 🌅');
  for (const text of ['', ' ', 'x'.repeat(1001)]) assert.throws(() => createMessage(text));
  for (const input of ['{}', '{', JSON.stringify({ ...message, v: 2 }), JSON.stringify({ ...message, text: [] }), 'x'.repeat(8001)]) assert.equal(parseMessage(input), null);
});
