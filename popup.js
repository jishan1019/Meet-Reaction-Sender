// Meet Reactor — Popup

const EMOJIS = [
  { emoji: '👍' }, { emoji: '❤️' }, { emoji: '😂' }, { emoji: '😮' }, { emoji: '👏' },
  { emoji: '🎉' }, { emoji: '😢' }, { emoji: '🤔' }, { emoji: '👎' }, { emoji: '🔥' },
];

let selectedEmojis = new Set();
let timesPerEmoji  = 5;
let loopEnabled    = true;
let clickDelayMs   = 400;
let isRunning      = false;
let statInterval   = null;

// DOM
const emojiGrid    = document.getElementById('emojiGrid');
const durationInput= document.getElementById('durationInput');
const unitSelect   = document.getElementById('unitSelect');
const durationWrap = document.getElementById('durationWrap');
const loopToggle   = document.getElementById('loopToggle');
const countValEl   = document.getElementById('countVal');
const speedSlider  = document.getElementById('speedSlider');
const speedLabel   = document.getElementById('speedLabel');
const previewText  = document.getElementById('previewText');
const mainBtn      = document.getElementById('mainBtn');
const statusBadge  = document.getElementById('statusBadge');
const statsRow     = document.getElementById('statsRow');
const statClicks   = document.getElementById('statClicks');
const statNext     = document.getElementById('statNext');
const statTimeCard = document.getElementById('statTimeCard');

// ── Emoji grid ────────────────────────────────────────────────────────────────
function buildGrid() {
  emojiGrid.innerHTML = '';
  EMOJIS.forEach(({ emoji }) => {
    const card = document.createElement('div');
    card.className = 'e-card';
    card.dataset.emoji = emoji;
    card.innerHTML = `<span class="em">${emoji}</span><div class="e-dot"></div>`;
    card.addEventListener('click', () => toggleEmoji(emoji, card));
    emojiGrid.appendChild(card);
  });
}

function toggleEmoji(emoji, card) {
  if (selectedEmojis.has(emoji)) {
    selectedEmojis.delete(emoji);
    card.classList.remove('sel');
  } else {
    selectedEmojis.add(emoji);
    card.classList.add('sel');
  }
  updatePreview();
  saveSettings();
}

function clearAllEmojis() {
  selectedEmojis.clear();
  emojiGrid.querySelectorAll('.e-card').forEach(c => c.classList.remove('sel'));
  updatePreview();
  saveSettings();
}

document.getElementById('clearAllBtn').addEventListener('click', clearAllEmojis);

// ── Loop toggle ───────────────────────────────────────────────────────────────
function applyLoopUI() {
  if (loopEnabled) {
    durationWrap.classList.add('open');
    statTimeCard.style.display = '';
  } else {
    durationWrap.classList.remove('open');
    statTimeCard.style.display = 'none';
  }
}

loopToggle.addEventListener('change', () => {
  loopEnabled = loopToggle.checked;
  applyLoopUI();
  updatePreview();
  saveSettings();
});

// ── Speed slider ──────────────────────────────────────────────────────────────
function applySpeedUI() {
  clickDelayMs = parseInt(speedSlider.value, 10);
  speedLabel.textContent = `${clickDelayMs}ms`;
}

speedSlider.addEventListener('input', () => {
  applySpeedUI();
  updatePreview();
  saveSettings();
});

// ── Stepper ───────────────────────────────────────────────────────────────────
document.getElementById('countDown').addEventListener('click', () => {
  if (timesPerEmoji > 1) { timesPerEmoji--; countValEl.textContent = timesPerEmoji; }
  updatePreview(); saveSettings();
});
document.getElementById('countUp').addEventListener('click', () => {
  if (timesPerEmoji < 50) { timesPerEmoji++; countValEl.textContent = timesPerEmoji; }
  updatePreview(); saveSettings();
});

durationInput.addEventListener('input', () => { updatePreview(); saveSettings(); });
unitSelect.addEventListener('change',  () => { updatePreview(); saveSettings(); });

// ── Preview ───────────────────────────────────────────────────────────────────
function getDurationSeconds() {
  const v = parseFloat(durationInput.value) || 1;
  return unitSelect.value === 'min' ? v * 60 : v;
}

function updatePreview() {
  const sel = [...selectedEmojis];
  if (sel.length === 0) {
    previewText.innerHTML = 'Select reactions above to get started…';
    return;
  }

  const total = sel.length * timesPerEmoji;
  const emojiRow = `<div class="em-row">${sel.join(' ')}</div>`;
  const delay = `<strong>${clickDelayMs}ms</strong> delay`;

  if (loopEnabled) {
    const dur = unitSelect.value === 'min'
      ? `${durationInput.value || 1} min`
      : `${durationInput.value || 1} sec`;
    previewText.innerHTML = `${emojiRow}
      <strong>${total}</strong> reactions / burst · ${delay}<br>
      Loops for <strong>${dur}</strong>, then auto-stops`;
  } else {
    previewText.innerHTML = `${emojiRow}
      Sends <strong>${total}</strong> reactions once · ${delay}<br>
      Stops after one burst`;
  }
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
mainBtn.addEventListener('click', () => {
  if (mainBtn.disabled) return;
  isRunning ? stopReactor() : startReactor();
});

async function getCurrentTab() {
  return new Promise(resolve =>
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]))
  );
}

async function startReactor() {
  if (selectedEmojis.size === 0) {
    previewText.innerHTML = '⚠️ Select at least one reaction emoji.';
    return;
  }

  // Immediate feedback — disable button while connecting
  mainBtn.disabled = true;
  mainBtn.textContent = 'Connecting…';

  const tab = await getCurrentTab();
  if (!tab || !tab.url || !tab.url.includes('meet.google.com')) {
    mainBtn.disabled = false;
    mainBtn.textContent = '🚀 Start Reactor';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('notMeet').style.display = 'block';
    return;
  }

  const config = {
    reactions:       [...selectedEmojis].map(emoji => ({ emoji, count: timesPerEmoji })),
    loopEnabled,
    durationSeconds: loopEnabled ? getDurationSeconds() : null,
    clickDelayMs,
  };

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'START', config });
    isRunning = true;
    chrome.storage.local.set({ isRunning: true, config });
    setRunningUI(true);
    startStatPoller(tab.id);
  } catch {
    mainBtn.disabled = false;
    mainBtn.textContent = '🚀 Start Reactor';
    previewText.innerHTML = '⚠️ Could not connect. Reload the Meet tab and try again.';
  }
}

async function stopReactor() {
  mainBtn.disabled = true;
  const tab = await getCurrentTab();
  if (tab) {
    try { await chrome.tabs.sendMessage(tab.id, { action: 'STOP' }); } catch {}
  }
  isRunning = false;
  chrome.storage.local.set({ isRunning: false });
  if (statInterval) { clearInterval(statInterval); statInterval = null; }
  setRunningUI(false);
}

function setRunningUI(running) {
  isRunning = running;
  mainBtn.disabled = false;
  if (running) {
    mainBtn.textContent = '⏹ Stop Reactor';
    mainBtn.classList.add('stop');
    statusBadge.textContent = 'LIVE';
    statusBadge.classList.add('live');
    statsRow.style.display = 'flex';
  } else {
    mainBtn.textContent = '🚀 Start Reactor';
    mainBtn.classList.remove('stop');
    statusBadge.textContent = 'IDLE';
    statusBadge.classList.remove('live');
    statsRow.style.display = 'none';
    statClicks.textContent = '0';
    statNext.textContent = '—';
  }
}

// ── Stat poller ───────────────────────────────────────────────────────────────
function startStatPoller(tabId) {
  if (statInterval) clearInterval(statInterval);

  statInterval = setInterval(async () => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (res?.running) {
        statClicks.textContent = res.stats?.totalClicks ?? 0;
        if (loopEnabled && res.endTime) {
          const s = Math.max(0, (res.endTime - Date.now()) / 1000);
          statNext.textContent = s < 1 ? '<1' : Math.ceil(s);
        }
      } else {
        setRunningUI(false);
        clearInterval(statInterval);
        statInterval = null;
      }
    } catch {
      setRunningUI(false);
      clearInterval(statInterval);
      statInterval = null;
    }
  }, 1000);
}

// ── Persist / restore ─────────────────────────────────────────────────────────
function saveSettings() {
  chrome.storage.local.set({
    selectedEmojis: [...selectedEmojis],
    timesPerEmoji,
    loopEnabled,
    clickDelayMs,
    durationValue: parseFloat(durationInput.value) || 1,
    durationUnit:  unitSelect.value,
  });
}

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['selectedEmojis','timesPerEmoji','loopEnabled','clickDelayMs','durationValue','durationUnit','isRunning','config'],
      data => {
        if (data.selectedEmojis) {
          data.selectedEmojis.forEach(e => {
            selectedEmojis.add(e);
            const card = emojiGrid.querySelector(`[data-emoji="${e}"]`);
            if (card) card.classList.add('sel');
          });
        }
        if (data.timesPerEmoji != null) { timesPerEmoji = data.timesPerEmoji; countValEl.textContent = timesPerEmoji; }
        if (data.loopEnabled   != null) { loopEnabled   = data.loopEnabled;   loopToggle.checked = loopEnabled; }
        if (data.clickDelayMs  != null) { clickDelayMs  = data.clickDelayMs;  speedSlider.value  = clickDelayMs; }
        if (data.durationValue != null) durationInput.value = data.durationValue;
        if (data.durationUnit  != null) unitSelect.value    = data.durationUnit;
        resolve(data);
      }
    );
  });
}

// Listen for content-script push events
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'CLICK_SUCCESS') statClicks.textContent = msg.total;
  if (msg.type === 'STOPPED') {
    setRunningUI(false);
    if (statInterval) { clearInterval(statInterval); statInterval = null; }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  buildGrid();
  const data = await loadSettings();
  applyLoopUI();
  applySpeedUI();
  updatePreview();

  if (data.isRunning) {
    const tab = await getCurrentTab();
    if (tab?.url?.includes('meet.google.com')) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        if (res?.running) {
          isRunning = true;
          setRunningUI(true);
          startStatPoller(tab.id);
        } else {
          chrome.storage.local.set({ isRunning: false });
        }
      } catch {
        chrome.storage.local.set({ isRunning: false });
      }
    }
  }
}

init();
