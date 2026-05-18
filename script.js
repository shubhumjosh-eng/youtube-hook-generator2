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

function getUsageCount() { return parseInt(localStorage.getItem('usageCount') || '0', 10); }
function incrementUsage() { const c = getUsageCount(); localStorage.setItem('usageCount', String(c + 1)); }

function showPaywall() { paywallModal.style.display = 'flex'; }
function hidePaywall() { paywallModal.style.display = 'none'; }
function showError(message) { error.textContent = message; error.style.display = 'block'; }
function hideError() { error.style.display = 'none'; }

function setLoading(loading) {
  generateBtn.disabled = loading;
  const btnText = generateBtn.querySelector('.btn-text');
  const spinner = generateBtn.querySelector('.spinner');
  if (loading) { btnText.textContent = 'Generating...'; spinner.style.display = 'inline-block'; }
  else { btnText.textContent = 'Generate Hooks'; spinner.style.display = 'none'; }
}

function parseHooks(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const hooks = [];
  for (const line of lines) { const c = line.replace(/^[\d\.\-\*\s]+/, '').trim(); if (c.length > 0) hooks.push(c); }
  return hooks.length > 0 ? hooks : [text.trim()];
}

function renderHooks(hooks) {
  results.innerHTML = '';
  hooks.forEach((hook, i) => {
    const card = document.createElement('div');
    card.className = 'hook-card';
    card.innerHTML = `<span class="hook-number">${i + 1}</span><span class="hook-text">${escapeHtml(hook)}</span><button class="copy-btn" data-hook="${escapeAttr(hook)}">Copy</button><button class="script-btn" data-hook="${escapeAttr(hook)}">Generate Script</button>`;
    results.appendChild(card);
  });
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.getAttribute('data-hook')).then(() => {
        btn.textContent = 'Copied!'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    });
  });
  document.querySelectorAll('.script-btn').forEach(btn => {
    btn.addEventListener('click', () => { generateScript(btn.getAttribute('data-hook')); });
  });
}

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str) { return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

async function generateHooks() {
  const topic = topicInput.value.trim();
  if (!topic) { showError('Please enter a video topic.'); return; }
  if (selectedStyles.length === 0) { showError('Please select at least one style.'); return; }
  if (!isPaid() && getUsageCount() >= FREE_LIMIT) { showPaywall(); resultsContainer.classList.add('blurred'); return; }
  hideError(); setLoading(true);
  try {
    const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, styles: selectedStyles }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed.'); }
    const data = await res.json();
    renderHooks(parseHooks(data.text));
    resultsContainer.classList.remove('blurred'); resultsContainer.style.display = 'block';
    if (!isPaid()) incrementUsage();
  } catch (err) { showError(err.message); }
  finally { setLoading(false); }
}

styleButtons.addEventListener('click', (e) => {
  if (!e.target.classList.contains('style-btn')) return;
  e.target.classList.toggle('selected');
  const style = e.target.getAttribute('data-style');
  if (selectedStyles.includes(style)) selectedStyles = selectedStyles.filter(s => s !== style);
  else selectedStyles.push(style);
});

generateBtn.addEventListener('click', generateHooks);
topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generateHooks(); });

closeScriptBtn.addEventListener('click', () => { scriptModal.style.display = 'none'; });
scriptModal.addEventListener('click', (e) => { if (e.target === scriptModal) scriptModal.style.display = 'none'; });
copyScriptBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentScriptText).then(() => {
    copyScriptBtn.textContent = 'Copied!';
    setTimeout(() => { copyScriptBtn.textContent = 'Copy Full Script'; }, 2000);
  });
});

async function generateScript(hook) {
  if (!isPaid()) { showPaywall(); return; }
  scriptModal.style.display = 'flex';
  scriptContent.innerHTML = '<div class="script-loading"><span class="spinner"></span><span>Writing...</span></div>';
  copyScriptBtn.style.display = 'none';
  const topic = topicInput.value.trim();
  const style = selectedStyles.join(', ') || 'Curiosity';
  try {
    const res = await fetch('/api/generate-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getBestToken()}`, 'X-Client-Id': getClientId() },
      body: JSON.stringify({ hook, topic, style })
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed.'); }
    const data = await res.json();
    currentScriptText = data.script;
    scriptContent.innerHTML = `<div class="script-body">${formatScript(data.script)}</div>`;
    copyScriptBtn.style.display = 'block';
  } catch (err) { scriptContent.innerHTML = `<div class="script-error">${err.message}</div>`; }
}

function formatScript(text) {
  return text.split('\n').map(line => {
    const t = line.trim();
    if (!t) return '<br>';
    if (/^\[/.test(t)) return `<div class="script-section">${escapeHtml(t)}</div>`;
    if (/^\*\*|^\#/.test(t)) return `<div class="script-heading">${escapeHtml(t.replace(/[\*\#]/g, ''))}</div>`;
    return `<div class="script-line">${escapeHtml(t)}</div>`;
  }).join('');
}

async function redeemCode() {
  const input = document.getElementById('unlockCode').value.trim().toUpperCase();
  const errEl = document.getElementById('codeError');
  if (!input) { errEl.textContent = 'Please enter a code.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    const res = await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input, clientId: getClientId() }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Invalid code.'; errEl.style.display = 'block'; return; }
    setUnlockToken(data.token);
    hidePaywall();
    if (resultsContainer) resultsContainer.classList.remove('blurred');
  } catch { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
}
