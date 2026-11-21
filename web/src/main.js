import { Session } from './session/session.js';
import { signalLink, decodeSignal } from './network/signaling.js';

const $ = id => document.getElementById(id);
const session = new Session();
let role = 'host';
let phase = 'idle';
let busy = false;
let qrModule;
let outputVersion = 0;

function notice(text, error = false) {
  $('notice').textContent = text;
  $('notice').classList.toggle('error', error);
}

function controls() {
  $('host-tab').disabled = busy;
  $('guest-tab').disabled = busy;
  $('create').disabled = busy;
  $('apply').disabled = busy || phase === 'connecting' || phase === 'connected';
  $('reset').disabled = busy;
}

async function run(action) {
  if (busy) return;
  busy = true;
  controls();
  notice('Подготавливаем соединение…');
  try { await action(); } catch (error) {
    notice(error.message || 'Не удалось установить связь. Создайте новое приглашение.', true);
  } finally { busy = false; controls(); }
}

function selectRole(nextRole) {
  session.close();
  role = nextRole;
  outputVersion++;
  $('host-tab').classList.toggle('selected', role === 'host');
  $('guest-tab').classList.toggle('selected', role === 'guest');
  $('host-tab').setAttribute('aria-pressed', role === 'host');
  $('guest-tab').setAttribute('aria-pressed', role === 'guest');
  $('instructions').textContent = role === 'host' ? 'Создайте приглашение и отправьте его попутчику. Он вернёт вам ссылку с ответом.' : 'Вставьте приглашение хоста. Затем передайте ему вашу ссылку с ответом.';
  $('create').hidden = role !== 'host';
  $('exchange').hidden = role === 'host';
  $('outgoing').hidden = true;
  $('reset').hidden = true;
  $('signal-input').value = '';
  $('signal-output').value = '';
  $('input-label').textContent = role === 'host' ? 'Ответ гостя' : 'Приглашение хоста';
  $('apply').textContent = role === 'host' ? 'Подключить гостя' : 'Создать ответ';
  $('messages').replaceChildren($('empty-chat'));
  $('empty-chat').hidden = false;
  notice('');
  controls();
}

async function showOutput(token) {
  const version = ++outputVersion;
  const link = signalLink(token);
  $('signal-output').value = link;
  $('outgoing').hidden = false;
  $('reset').hidden = false;
  $('output-label').textContent = role === 'host' ? 'ВАШЕ ПРИГЛАШЕНИЕ' : 'ВАШ ОТВЕТ ХОСТУ';
  $('output-hint').textContent = role === 'host' ? 'Передайте гостю ссылку или QR-код.' : 'Хост должен вставить этот ответ у себя.';
  $('qr').hidden = true;
  $('qr-status').textContent = 'Подготавливаем QR…';
  try {
    qrModule ??= import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const { default: QRCode } = await qrModule;
    if (version !== outputVersion) return;
    await QRCode.toCanvas($('qr'), link, { width: 220, margin: 3, errorCorrectionLevel: 'L', color: { dark: '#243831', light: '#ffffff' } });
    $('qr').hidden = false;
    $('qr-status').textContent = 'Откройте камерой телефона';
  } catch {
    if (version === outputVersion) $('qr-status').textContent = 'QR недоступен. Скопируйте ссылку.';
    qrModule = undefined;
  }
}

$('host-tab').addEventListener('click', () => selectRole('host'));
$('guest-tab').addEventListener('click', () => selectRole('guest'));
$('reset').addEventListener('click', () => selectRole(role));
$('create').addEventListener('click', () => run(async () => {
  const token = await session.host();
  $('create').hidden = true;
  $('exchange').hidden = false;
  void showOutput(token);
  notice('Приглашение готово. Ждём ответ попутчика.');
}));
$('exchange').addEventListener('submit', event => {
  event.preventDefault();
  void run(async () => {
    if (role === 'host') {
      await session.accept($('signal-input').value);
      notice('Ответ принят. Устанавливаем прямое соединение…');
    } else {
      const token = await session.join($('signal-input').value);
      void showOutput(token);
      $('exchange').hidden = true;
      notice('Отправьте ответ хосту и оставьте эту вкладку открытой.');
    }
  });
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('signal-output').value); notice('Ссылка скопирована.'); }
  catch { $('signal-output').focus(); $('signal-output').select(); notice('Скопируйте выделенную ссылку вручную.'); }
});

session.addEventListener('state', event => {
  phase = event.detail;
  const labels = { idle: 'Нет связи', gathering: 'Поиск адресов', new: 'Ожидание', connecting: 'Соединяемся', connected: 'В эфире · 2/2', disconnected: 'Связь прервана', failed: 'Нет соединения', closed: 'Канал закрыт' };
  $('connection-status').textContent = labels[phase] || 'Ожидание';
  $('connection-status').dataset.state = phase;
  const connected = phase === 'connected';
  $('message').disabled = !connected;
  $('send').disabled = !connected;
  $('message').placeholder = connected ? 'Сообщение попутчику…' : 'Сначала установите связь';
  if (connected) {
    $('exchange').hidden = true;
    $('outgoing').hidden = true;
    notice('Попутчик на связи. Проверьте канал сообщением.');
    $('message').focus();
  }
  if (phase === 'failed') notice('Прямое соединение не удалось. Сбросьте сессию и попробуйте другую сеть. Строгий NAT или блокировка UDP могут мешать связи.', true);
  controls();
});
const emptyChat = $('empty-chat');
session.addEventListener('message', event => {
  emptyChat.hidden = true;
  const { text, local } = event.detail;
  const item = document.createElement('article');
  item.className = local ? 'message local' : 'message';
  const meta = document.createElement('small');
  meta.textContent = `${local ? 'ВЫ' : 'ПОПУТЧИК'} · ${new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
  const body = document.createElement('p');
  body.textContent = text;
  item.append(meta, body);
  $('messages').append(item);
  while ($('messages').childElementCount > 201) $('messages').children[1].remove();
  $('messages').scrollTop = $('messages').scrollHeight;
});
$('chat-form').addEventListener('submit', event => {
  event.preventDefault();
  try { session.send($('message').value); $('message').value = ''; }
  catch (error) { notice(error.message, true); }
});
window.addEventListener('pagehide', () => session.close());

async function importInvitation() {
  const hash = location.hash;
  if (!hash) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const signal = await decodeSignal(hash.slice(1));
    selectRole(signal.type === 'offer' ? 'guest' : 'host');
    $('signal-input').value = hash.slice(1);
    if (signal.type === 'offer') notice('Приглашение получено. Нажмите «Создать ответ».');
    else notice('Ответ нужно вставить в исходную вкладку хоста. Эта вкладка не хранит его сессию.', true);
  } catch (error) { notice(error.message, true); }
}
if (!globalThis.RTCPeerConnection || !globalThis.CompressionStream || !globalThis.isSecureContext) {
  notice('Нужен современный браузер с WebRTC и HTTPS. Локально используйте localhost.', true);
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
} else { void importInvitation(); }
