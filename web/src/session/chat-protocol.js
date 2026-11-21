export const MAX_MESSAGE_LENGTH = 1000;

export function createMessage(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_MESSAGE_LENGTH) throw new Error('Сообщение должно содержать от 1 до 1000 символов.');
  return { v: 1, kind: 'chat', id: crypto.randomUUID(), text: text.trim() };
}

export function parseMessage(payload) {
  if (typeof payload !== 'string' || payload.length > 8000) return null;
  try {
    const message = JSON.parse(payload);
    if (message.v !== 1 || message.kind !== 'chat' || typeof message.id !== 'string' || message.id.length > 64 || typeof message.text !== 'string' || !message.text.trim() || message.text.length > MAX_MESSAGE_LENGTH) return null;
    return message;
  } catch { return null; }
}
