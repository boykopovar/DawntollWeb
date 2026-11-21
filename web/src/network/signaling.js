const MAX_SIZE = 24000;

export async function encodeSignal(description, sessionId) {
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, sessionId, type: description.type, sdp: description.sdp }));
  const compressed = await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(compressed))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function decodeSignal(input) {
  let token = input.trim();
  if (token.includes('#')) token = new URL(token).hash.slice(1);
  if (!/^[\w-]+$/.test(token) || token.length > MAX_SIZE) throw new Error('Вставьте полную ссылку приглашения или ответа.');
  try {
    const bytes = Uint8Array.from(atob(token.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    let text = '';
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > MAX_SIZE) { await reader.cancel(); throw new Error(); }
    }
    const signal = JSON.parse(text);
    if (signal.v !== 1 || !['offer', 'answer'].includes(signal.type) || typeof signal.sdp !== 'string' || !/^[-\w]{36}$/.test(signal.sessionId)) throw new Error();
    return signal;
  } catch {
    throw new Error('Приглашение повреждено или имеет другую версию.');
  }
}

export function signalLink(token, location = globalThis.location) {
  return `${location.origin}${location.pathname}#${token}`;
}
