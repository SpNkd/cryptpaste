import './styles.css';
import { ApiError, createPaste, deletePaste, getPaste } from './api';
import { decryptText, encryptText, MAX_PLAINTEXT_BYTES, randomToken } from './crypto';

type Route = { kind: 'home' } | { kind: 'paste'; id: string };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');
const root = app;

const basePath = import.meta.env.BASE_URL || '/';
let ownerDeleteToken: string | null = null;
let activePlaintext = '';

function route(): Route {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const pasteMarker = segments.lastIndexOf('p');
  const id = pasteMarker >= 0 ? segments[pasteMarker + 1] : undefined;
  return id && /^[A-Za-z0-9_-]{16}$/.test(id) ? { kind: 'paste', id } : { kind: 'home' };
}

function homeHref(): string {
  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

function pasteHref(id: string): string {
  return `${homeHref()}p/${id}`;
}

function setTheme(theme: 'light' | 'dark' | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  try {
    if (theme) localStorage.setItem('cryptpaste-theme', theme);
    else localStorage.removeItem('cryptpaste-theme');
  } catch {
    // Theme preference is optional and never affects the note security model.
  }
}

function restoreTheme(): void {
  try {
    const stored = localStorage.getItem('cryptpaste-theme');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  } catch {
    // Ignore unavailable storage.
  }
}

function header(): string {
  return `<header class="topbar">
    <a class="brand" href="${homeHref()}" aria-label="CryptPaste — на главную"><span class="brand-mark">C</span>CryptPaste</a>
    <div class="top-actions">
      <button class="icon-button" type="button" data-action="theme" aria-label="Переключить тему" title="Переключить тему">◐</button>
    </div>
  </header>`;
}

function layout(content: string): string {
  return `<div class="shell">${header()}<main>${content}</main><footer class="footer">Шифрование выполняется локально в браузере · <a href="${homeHref()}#privacy">О приватности</a></footer></div>`;
}

function setMessage(element: HTMLElement, message: string, success = false): void {
  element.textContent = message;
  element.classList.toggle('success', success);
}

function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
  button.disabled = busy;
  button.innerHTML = busy ? `<span class="spinner" aria-hidden="true"></span>Подождите…` : label;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const helper = document.createElement('textarea');
    helper.value = value;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    return copied;
  }
}

function renderHome(): void {
  ownerDeleteToken = null;
  activePlaintext = '';
  root.innerHTML = layout(`
    <section class="hero">
      <p class="eyebrow">Private by design</p>
      <h1>Передайте короткий текст безопасно.</h1>
      <p class="lede">Заметка шифруется в вашем браузере. Сервер хранит только зашифрованный payload и не видит ни текст, ни пароль.</p>
    </section>
    <section class="panel" aria-labelledby="create-title">
      <h2 id="create-title" class="hidden">Создать защищённую заметку</h2>
      <form id="create-form" class="form-grid" novalidate>
        <div class="field">
          <label for="note">Вставьте текст</label>
          <textarea id="note" name="note" maxlength="32768" placeholder="Небольшая заметка, команда или фрагмент конфигурации…" required></textarea>
          <span class="hint">До 32 KiB. Считается размер UTF-8, а не количество символов.</span>
        </div>
        <div class="password-row">
          <div class="field">
            <label for="password">Пароль</label>
            <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" placeholder="Обязателен" required />
          </div>
          <div class="field">
            <label for="password-repeat">Повторите пароль</label>
            <input id="password-repeat" name="password-repeat" type="password" autocomplete="new-password" minlength="8" placeholder="Ещё раз" required />
          </div>
        </div>
        <div class="options">
          <div class="field">
            <label for="ttl">Удалить через</label>
            <select id="ttl" name="ttl">
              <option value="600">10 минут</option>
              <option value="3600">1 час</option>
              <option value="86400" selected>24 часа</option>
              <option value="604800">7 дней</option>
            </select>
          </div>
          <label class="check" for="delete-after-read"><input id="delete-after-read" type="checkbox" /><span><strong>Удалить после прочтения</strong><small class="hint">Best effort: две вкладки могут прочитать заметку одновременно.</small></span></label>
        </div>
        <div class="actions"><button class="primary" id="create-button" type="submit">Создать защищённую ссылку</button></div>
        <p class="message" id="form-message" aria-live="polite"></p>
      </form>
      <div class="security-note"><span aria-hidden="true">⌁</span><span><strong>Пароль не передаётся серверу.</strong> Если вы его забудете, восстановить текст невозможно.</span></div>
    </section>`);

  const form = document.querySelector<HTMLFormElement>('#create-form');
  const message = document.querySelector<HTMLParagraphElement>('#form-message');
  const button = document.querySelector<HTMLButtonElement>('#create-button');
  if (!form || !message || !button) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const note = document.querySelector<HTMLTextAreaElement>('#note');
    const password = document.querySelector<HTMLInputElement>('#password');
    const repeat = document.querySelector<HTMLInputElement>('#password-repeat');
    const ttl = document.querySelector<HTMLSelectElement>('#ttl');
    const deleteAfterRead = document.querySelector<HTMLInputElement>('#delete-after-read');
    if (!note || !password || !repeat || !ttl || !deleteAfterRead) return;
    setMessage(message, '');
    const bytes = new TextEncoder().encode(note.value).byteLength;
    if (!note.value.trim()) return setMessage(message, 'Введите текст заметки.');
    if (bytes > MAX_PLAINTEXT_BYTES) return setMessage(message, 'Текст превышает лимит 32 KiB.');
    if (password.value.length < 8) return setMessage(message, 'Пароль должен содержать минимум 8 символов.');
    if (password.value !== repeat.value) return setMessage(message, 'Пароли не совпадают.');
    const passwordValue = password.value;
    setBusy(button, true, 'Создать защищённую ссылку');
    try {
      const envelope = await encryptText(note.value, passwordValue);
      const deleteToken = randomToken();
      const response = await createPaste({
        ...envelope,
        ttlSeconds: Number(ttl.value) as 600 | 3600 | 86400 | 604800,
        deleteAfterRead: deleteAfterRead.checked,
        deleteToken,
      });
      ownerDeleteToken = deleteToken;
      renderCreated(response.id, response.expiresAt);
    } catch (error) {
      setMessage(message, error instanceof Error && error.message === 'text-too-large' ? 'Текст превышает лимит 32 KiB.' : error instanceof ApiError ? error.message : 'Не удалось создать заметку. Попробуйте ещё раз.');
      setBusy(button, false, 'Создать защищённую ссылку');
    } finally {
      password.value = '';
      repeat.value = '';
    }
  });
}

function renderCreated(id: string, expiresAt: string): void {
  const url = new URL(pasteHref(id), window.location.origin).toString();
  root.innerHTML = layout(`
    <section class="hero"><p class="eyebrow">Готово</p><h1>Ссылка создана.</h1><p class="lede">Передайте её вместе с паролем по другому каналу. Ссылка истечёт ${new Date(expiresAt).toLocaleString('ru-RU')}.</p></section>
    <section class="panel" aria-labelledby="created-title">
      <div class="success-mark" aria-hidden="true">✓</div>
      <h2 id="created-title">Защищённая ссылка</h2>
      <div class="result-url"><input id="share-url" type="text" readonly aria-label="Защищённая ссылка" /><button class="secondary" id="copy-url" type="button">Скопировать</button></div>
      <p class="hint">Пароль не входит в ссылку и не хранится сервисом. Не отправляйте ссылку и пароль в одном сообщении.</p>
      <div class="actions" style="margin-top: 22px"><button class="danger" id="delete-owner" type="button">Удалить заметку</button><button class="secondary" id="new-note" type="button">Создать ещё</button></div>
      <p class="message" id="result-message" aria-live="polite"></p>
    </section>`);
  const urlInput = document.querySelector<HTMLInputElement>('#share-url');
  const copyButton = document.querySelector<HTMLButtonElement>('#copy-url');
  const deleteButton = document.querySelector<HTMLButtonElement>('#delete-owner');
  const newButton = document.querySelector<HTMLButtonElement>('#new-note');
  const message = document.querySelector<HTMLParagraphElement>('#result-message');
  if (urlInput) urlInput.value = url;
  copyButton?.addEventListener('click', async () => {
    if (!message) return;
    setMessage(message, await copyText(url) ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку.', true);
  });
  deleteButton?.addEventListener('click', async () => {
    if (!message || !ownerDeleteToken || !window.confirm('Удалить заметку сейчас?')) return;
    deleteButton.disabled = true;
    try {
      await deletePaste(id, ownerDeleteToken, 'owner');
      ownerDeleteToken = null;
      setMessage(message, 'Заметка удалена.', true);
      deleteButton.remove();
    } catch (error) {
      deleteButton.disabled = false;
      setMessage(message, error instanceof ApiError ? error.message : 'Не удалось удалить заметку.');
    }
  });
  newButton?.addEventListener('click', () => { window.history.pushState({}, '', homeHref()); render(); });
}

function renderPaste(id: string): void {
  activePlaintext = '';
  root.innerHTML = layout(`
    <section class="hero"><p class="eyebrow">Защищённая заметка</p><h1>Введите пароль.</h1><p class="lede">Расшифровка выполняется локально. Сервер не получает пароль и не узнает, был ли он правильным.</p></section>
    <section class="panel" aria-labelledby="decrypt-title">
      <form id="decrypt-form" class="form-grid" novalidate>
        <div class="field"><label for="decrypt-password">Пароль</label><input id="decrypt-password" type="password" autocomplete="current-password" placeholder="Введите пароль" required /></div>
        <div class="actions"><button class="primary" id="decrypt-button" type="submit">Расшифровать</button><button class="danger" id="delete-viewer" type="button">Удалить заметку</button></div>
        <p class="message" id="decrypt-message" aria-live="polite"></p>
      </form>
      <div id="decrypted" class="hidden">
        <div class="label">Текст заметки</div><pre id="note-content" class="note-content" tabindex="0"></pre>
        <div class="actions"><button class="secondary" id="copy-text" type="button">Скопировать текст</button><button class="secondary" id="hide-text" type="button">Скрыть</button><button class="danger" id="delete-after-decrypt" type="button">Удалить заметку</button></div>
      </div>
      <div class="security-note"><span aria-hidden="true">⌁</span><span>Неверный пароль не отправляется на сервер. При ошибке AES-GCM покажет общее сообщение: «Неверный пароль или данные повреждены».</span></div>
    </section>`);

  const form = document.querySelector<HTMLFormElement>('#decrypt-form');
  const password = document.querySelector<HTMLInputElement>('#decrypt-password');
  const button = document.querySelector<HTMLButtonElement>('#decrypt-button');
  const message = document.querySelector<HTMLParagraphElement>('#decrypt-message');
  const decrypted = document.querySelector<HTMLDivElement>('#decrypted');
  const content = document.querySelector<HTMLPreElement>('#note-content');
  const deleteViewer = document.querySelector<HTMLButtonElement>('#delete-viewer');
  const deleteAfterDecrypt = document.querySelector<HTMLButtonElement>('#delete-after-decrypt');
  if (!form || !password || !button || !message || !decrypted || !content || !deleteViewer || !deleteAfterDecrypt) return;

  let readDeleteToken: string | null = null;
  let deleteAfterRead = false;
  let loaded = false;

  const deleteWithAvailableToken = async (source: 'owner' | 'read'): Promise<void> => {
    const token = source === 'owner' ? ownerDeleteToken : readDeleteToken;
    if (!token) {
      setMessage(message, 'Токен удаления доступен только в исходной вкладке создателя или после получения заметки.');
      return;
    }
    try {
      await deletePaste(id, token, source);
      if (source === 'owner') ownerDeleteToken = null;
      if (source === 'read') readDeleteToken = null;
      setMessage(message, 'Заметка удалена.', true);
      deleteViewer.remove();
      deleteAfterDecrypt.remove();
    } catch (error) {
      setMessage(message, error instanceof ApiError ? error.message : 'Не удалось удалить заметку.');
    }
  };

  deleteViewer.addEventListener('click', async () => {
    const source = ownerDeleteToken ? 'owner' : readDeleteToken ? 'read' : null;
    if (!source || !window.confirm('Удалить заметку сейчас?')) {
      if (!source) setMessage(message, 'В этой вкладке нет токена удаления.');
      return;
    }
    await deleteWithAvailableToken(source);
  });
  deleteAfterDecrypt.addEventListener('click', async () => {
    const source = ownerDeleteToken ? 'owner' : readDeleteToken ? 'read' : null;
    if (!source || !window.confirm('Удалить заметку сейчас?')) return;
    await deleteWithAvailableToken(source);
  });
  document.querySelector<HTMLButtonElement>('#hide-text')?.addEventListener('click', () => {
    activePlaintext = '';
    content.textContent = '';
    decrypted.classList.add('hidden');
    setMessage(message, 'Текст скрыт.', true);
  });
  document.querySelector<HTMLButtonElement>('#copy-text')?.addEventListener('click', async () => {
    setMessage(message, await copyText(activePlaintext) ? 'Текст скопирован.' : 'Не удалось скопировать текст.', true);
  });

  void (async () => {
    try {
      const response = await getPaste(id);
      readDeleteToken = response.readDeleteToken || null;
      deleteAfterRead = response.deleteAfterRead;
      loaded = true;
      if (deleteAfterRead) setMessage(message, 'После успешной расшифровки заметка будет удалена с сервера.', true);
    } catch (error) {
      setMessage(message, error instanceof ApiError ? error.message : 'Не удалось загрузить заметку.');
      button.disabled = true;
    }
  })();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!loaded) return setMessage(message, 'Заметка ещё загружается.');
    if (!password.value) return setMessage(message, 'Введите пароль.');
    const passwordValue = password.value;
    setBusy(button, true, 'Расшифровать');
    try {
      const response = await getPaste(id);
      // A fresh GET supplies a fresh best-effort read-delete token.
      readDeleteToken = response.readDeleteToken || readDeleteToken;
      deleteAfterRead = response.deleteAfterRead;
      activePlaintext = await decryptText(response, passwordValue);
      content.textContent = activePlaintext;
      decrypted.classList.remove('hidden');
      setMessage(message, deleteAfterRead ? 'Расшифровано. Заметка удаляется с сервера.' : 'Расшифровано локально.', true);
      if (deleteAfterRead && readDeleteToken) {
        try {
          await deletePaste(id, readDeleteToken, 'read');
          readDeleteToken = null;
        } catch {
          setMessage(message, 'Текст расшифрован, но автоматическое удаление не подтвердилось.', false);
        }
      }
    } catch (error) {
      activePlaintext = '';
      content.textContent = '';
      setMessage(message, error instanceof ApiError ? error.message : 'Неверный пароль или данные повреждены.');
    } finally {
      password.value = '';
      setBusy(button, false, 'Расшифровать');
    }
  });
}

function bindGlobalActions(): void {
  document.querySelector<HTMLButtonElement>('[data-action="theme"]')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function render(): void {
  restoreTheme();
  if (route().kind === 'paste') renderPaste((route() as { kind: 'paste'; id: string }).id);
  else renderHome();
  bindGlobalActions();
}

window.addEventListener('popstate', render);
render();
