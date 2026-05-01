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
const paidBtn = document.getElementById('paidBtn');

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

function isPaid() {
  return localStorage.getItem('paid') === 'true';
}

function markAsPaid() {
  localStorage.setItem('paid', 'true');
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

function buildPrompt(topic, styles) {
  return `Generate 5 viral YouTube hooks for a faceless YouTube video.

Topic: ${topic}

Style: ${styles.join(', ')}

Rules:
* Max 12 words per hook
* Extremely high curiosity
* Designed for first 5 seconds retention
* No fluff
* No generic phrases
* Make each hook irresistible

Return as a numbered list.`;
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
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        styles: selectedStyles
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to generate hooks. Please try again.');
    }

    const data = await response.json();
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

paidBtn.addEventListener('click', () => {
  markAsPaid();
  hidePaywall();
  resultsContainer.classList.remove('blurred');
});

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
    const response = await fetch('/api/generate-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook, topic, style })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to generate script.');
    }

    const data = await response.json();
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
