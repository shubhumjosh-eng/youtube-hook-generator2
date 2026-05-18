const CLIENT_ID_KEY = 'hookforge_client_id';
function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function getUnlockToken() { return localStorage.getItem('hookforge_token'); }
function setUnlockToken(t) { localStorage.setItem('hookforge_token', t); }
function getAuthToken() { return localStorage.getItem('hookforge_auth_token'); }
function setAuthToken(t) { localStorage.setItem('hookforge_auth_token', t); }
function clearAuthToken() { localStorage.removeItem('hookforge_auth_token'); }
function getBestToken() { return getAuthToken() || getUnlockToken(); }
function isPaid() { return !!getAuthToken() || !!getUnlockToken(); }

/* ── Request encryption ── */
let _encryptionKey = null;

async function _getEncryptionKey() {
  if (_encryptionKey) return _encryptionKey;
  try {
    const res = await fetch('/api/key');
    if (!res.ok) return null;
    const data = await res.json();
    _encryptionKey = data.key || null;
    return _encryptionKey;
  } catch {
    return null;
  }
}

function _hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

function _bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _encryptData(data, keyHex) {
  const rawKey = _hexToBytes(keyHex);
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { iv: _bytesToHex(iv), data: _bytesToHex(new Uint8Array(ciphertext)) };
}

async function _decryptData(encrypted, keyHex) {
  const rawKey = _hexToBytes(keyHex);
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = _hexToBytes(encrypted.iv);
  const ciphertext = _hexToBytes(encrypted.data);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function apiPost(url, data, extraHeaders) {
  const keyHex = await _getEncryptionKey();
  const body = keyHex ? JSON.stringify(await _encryptData(data, keyHex)) : JSON.stringify(data);
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  const res = await fetch(url, { method: 'POST', headers, body });
  const raw = await res.json();
  if (keyHex && raw && raw.iv && raw.data) {
    try { return { ok: res.ok, status: res.status, data: await _decryptData(raw, keyHex) }; }
    catch { return { ok: false, status: 400, data: { error: 'Decryption failed' } }; }
  }
  return { ok: res.ok, status: res.status, data: raw };
}

_getEncryptionKey();

const topicInput = document.getElementById('topic');
const styleButtons = document.getElementById('styleButtons');
const generateBtn = document.getElementById('generateBtn');
const resultsContainer = document.getElementById('resultsContainer');
const results = document.getElementById('results');
const error = document.getElementById('error');
const scriptModal = document.getElementById('scriptModal');
const scriptContent = document.getElementById('scriptContent');
const closeScriptBtn = document.getElementById('closeScriptBtn');
const copyScriptBtn = document.getElementById('copyScriptBtn');
const paywallModal = document.getElementById('paywallModal');

const FREE_LIMIT = 3;

let selectedStyles = [];
let currentScriptText = '';

function getUsageCount() {
  return parseInt(localStorage.getItem('usageCount') || '0', 10);
}

function incrementUsage() {
  const current = getUsageCount();
  localStorage.setItem('usageCount', String(current + 1));
}

function showPaywall() {
  paywallModal.style.display = 'flex';
}

function hidePaywall() {
  paywallModal.style.display = 'none';
}

function showError(message) {
  error.textContent = message;
  error.style.display = 'block';
}

function hideError() {
  error.style.display = 'none';
}

function setLoading(loading) {
  generateBtn.disabled = loading;
  const btnText = generateBtn.querySelector('.btn-text');
  const spinner = generateBtn.querySelector('.spinner');
  if (loading) {
    btnText.textContent = 'Generating...';
    spinner.style.display = 'inline-block';
  } else {
    btnText.textContent = 'Generate Hooks';
    spinner.style.display = 'none';
  }
}

function parseHooks(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const hooks = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[\d\.\-\*\s]+/, '').trim();
    if (cleaned.length > 0) {
      hooks.push(cleaned);
    }
  }
  return hooks.length > 0 ? hooks : [text.trim()];
}

function renderHooks(hooks) {
  results.innerHTML = '';
  hooks.forEach((hook, i) => {
    const card = document.createElement('div');
    card.className = 'hook-card';
    card.innerHTML = `
      <span class="hook-number">${i + 1}</span>
      <span class="hook-text">${escapeHtml(hook)}</span>
      <button class="copy-btn" data-hook="${escapeAttr(hook)}">Copy</button>
      <button class="script-btn" data-hook="${escapeAttr(hook)}">Generate Script</button>
    `;
    results.appendChild(card);
  });

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-hook');
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });

  document.querySelectorAll('.script-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hook = btn.getAttribute('data-hook');
      generateScript(hook);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function generateHooks() {
  const topic = topicInput.value.trim();
  if (!topic) {
    showError('Please enter a video topic.');
    return;
  }

  if (selectedStyles.length === 0) {
    showError('Please select at least one style.');
    return;
  }

  if (!isPaid() && getUsageCount() >= FREE_LIMIT) {
    showPaywall();
    resultsContainer.classList.add('blurred');
    return;
  }

  hideError();
  setLoading(true);

  try {
    const { ok, data } = await apiPost('/api/generate', { topic, styles: selectedStyles });
    if (!ok) throw new Error(data.error || 'Failed to generate hooks. Please try again.');
    const hooks = parseHooks(data.text);
    renderHooks(hooks);
    resultsContainer.classList.remove('blurred');
    resultsContainer.style.display = 'block';

    if (!isPaid()) {
      incrementUsage();
    }
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

styleButtons.addEventListener('click', (e) => {
  if (!e.target.classList.contains('style-btn')) return;
  e.target.classList.toggle('selected');
  const style = e.target.getAttribute('data-style');
  if (selectedStyles.includes(style)) {
    selectedStyles = selectedStyles.filter(s => s !== style);
  } else {
    selectedStyles.push(style);
  }
});

generateBtn.addEventListener('click', generateHooks);

topicInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    generateHooks();
  }
});

closeScriptBtn.addEventListener('click', () => {
  scriptModal.style.display = 'none';
});

scriptModal.addEventListener('click', (e) => {
  if (e.target === scriptModal) {
    scriptModal.style.display = 'none';
  }
});

copyScriptBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentScriptText).then(() => {
    copyScriptBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyScriptBtn.textContent = 'Copy Full Script';
    }, 2000);
  });
});

async function generateScript(hook) {
  if (!isPaid()) { showPaywall(); return; }
  scriptModal.style.display = 'flex';
  scriptContent.innerHTML = `
    <div class="script-loading">
      <span class="spinner"></span>
      <span>Writing your script...</span>
    </div>
  `;
  copyScriptBtn.style.display = 'none';

  const topic = topicInput.value.trim();
  const style = selectedStyles.join(', ') || 'Curiosity';

  try {
    const { ok, data } = await apiPost('/api/generate-script', { hook, topic, style }, {
      'Authorization': `Bearer ${getBestToken()}`,
      'X-Client-Id': getClientId()
    });
    if (!ok) throw new Error(data.error || 'Failed to generate script.');
    currentScriptText = data.script;
    const formattedScript = formatScript(data.script);
    scriptContent.innerHTML = `<div class="script-body">${formattedScript}</div>`;
    copyScriptBtn.style.display = 'block';
  } catch (err) {
    scriptContent.innerHTML = `<div class="script-error">${err.message}</div>`;
  }
}

function formatScript(text) {
  const lines = text.split('\n');
  let html = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      html += '<br>';
      continue;
    }
    if (/^\[/.test(trimmed)) {
      html += `<div class="script-section">${escapeHtml(trimmed)}</div>`;
    } else if (/^\*\*|^\#/.test(trimmed)) {
      html += `<div class="script-heading">${escapeHtml(trimmed.replace(/[\*\#]/g, ''))}</div>`;
    } else {
      html += `<div class="script-line">${escapeHtml(trimmed)}</div>`;
    }
  }
  return html;
}

async function redeemCode() {
  const input = document.getElementById('unlockCode').value.trim().toUpperCase();
  const errEl = document.getElementById('codeError');
  if (!input) { errEl.textContent = 'Please enter an unlock code.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    const { ok, data } = await apiPost('/api/redeem', { code: input, clientId: getClientId() });
    if (!ok) { errEl.textContent = data.error || 'Invalid code.'; errEl.style.display = 'block'; return; }
    setUnlockToken(data.token);
    hidePaywall();
    if (resultsContainer) resultsContainer.classList.remove('blurred');
  } catch {
    errEl.textContent = 'Network error. Please check your connection.';
    errEl.style.display = 'block';
  }
}
