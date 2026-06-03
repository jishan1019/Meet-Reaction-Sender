// Meet Reactor - Popup Script

const EMOJIS = [
  { emoji: '👍', label: 'Thumbs Up' },
  { emoji: '❤️', label: 'Heart' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '🎉', label: 'Party' },
  { emoji: '😢', label: 'Cry' },
  { emoji: '🤔', label: 'Think' },
  { emoji: '👎', label: 'Down' },
  { emoji: '🔥', label: 'Fire' },
];

let selectedEmojis = new Set();
let timesPerEmoji = 5;
let loopEnabled = true;
let clickDelayMs = 400;
let isRunning = false;
let statInterval = null;

// DOM refs
const emojiGrid       = document.getElementById('emojiGrid');
const durationInput   = document.getElementById('durationInput');
const unitSelect      = document.getElementById('unitSelect');
const durationRow     = document.getElementById('durationRow');
const loopToggle      = document.getElementById('loopToggle');
const countValEl      = document.getElementById('countVal');
const speedSlider     = document.getElementById('speedSlider');
const speedLabel      = document.getElementById('speedLabel');
const previewText     = document.getElementById('previewText');
const mainBtn         = document.getElementById('mainBtn');
const statusBadge     = document.getElementById('statusBadge');
const statsRow        = document.getElementById('statsRow');
const statClicks      = document.getElementById('statClicks');
const statNext        = document.getElementById('statNext');
const statTimeCard    = document.getElementById('statTimeCard');
const statTimeLabel   = document.getElementById('statTimeLabel');

// ── Emoji grid ──────────────────────────────────────────────────────────────
function buildGrid() {
  emojiGrid.innerHTML = '';
  EMOJIS.forEach(({ emoji, label }) => {
    const card = document.createElement('div');
    card.className = 'emoji-card';
    card.dataset.emoji = emoji;
    card.innerHTML = `
      <span class="em">${emoji}</span>
      <span class="em-count">${label}</span>
      <div class="count-badge">✓</div>
    `;
    card.addEventListener('click', () => toggleEmoji(emoji, card));
    emojiGrid.appendChild(card);
  });
}

function toggleEmoji(emoji, card) {
  if (selectedEmojis.has(emoji)) {
    selectedEmojis.delete(emoji);
    card.classList.remove('selected');
  } else {
    selectedEmojis.add(emoji);
    card.classList.add('selected');
  }
  updatePreview();
  saveSettings();
}

function clearAllEmojis() {
  selectedEmojis.clear();
  emojiGrid.querySelectorAll('.emoji-card').forEach(c => c.classList.remove('selected'));
  updatePreview();
  saveSettings();
}

document.getElementById('clearAllBtn').addEventListener('click', clearAllEmojis);

// ── Loop toggle ──────────────────────────────────────────────────────────────
function applyLoopUI() {
  durationRow.style.display = loopEnabled ? 'flex' : 'none';
  statTimeCard.style.display = loopEnabled ? '' : 'none';
}

loopToggle.addEventListener('change', () => {
  loopEnabled = loopToggle.checked;
  applyLoopUI();
  updatePreview();
  saveSettings();
});

// ── Speed slider ─────────────────────────────────────────────────────────────
function applySpeedUI() {
  clickDelayMs = parseInt(speedSlider.value, 10);
  speedLabel.textContent = `${clickDelayMs}ms / click`;
}

speedSlider.addEventListener('input', () => {
  applySpeedUI();
  updatePreview();
  saveSettings();
});

// ── Stepper (max 50) ─────────────────────────────────────────────────────────
document.getElementById('countDown').addEventListener('click', () => {
  if (timesPerEmoji > 1) { timesPerEmoji--; countValEl.textContent = timesPerEmoji; }
  updatePreview(); saveSettings();
});
document.getElementById('countUp').addEventListener('click', () => {
  if (timesPerEmoji < 50) { timesPerEmoji++; countValEl.textContent = timesPerEmoji; }
  updatePreview(); saveSettings();
});

durationInput.addEventListener('input', () => { updatePreview(); saveSettings(); });
unitSelect.addEventListener('change', () => { updatePreview(); saveSettings(); });

// ── Preview ───────────────────────────────────────────────────────────────────
function getDurationSeconds() {
  const val = parseFloat(durationInput.value) || 1;
  return unitSelect.value === 'min' ? val * 60 : val;
}

function updatePreview() {
  const selected = [...selectedEmojis];
  const total = selected.length * timesPerEmoji;

  if (selected.length === 0) {
    previewText.innerHTML = 'Select reactions above to preview schedule…';
    return;
  }

  const emojiStr = selected.join(' ');
  const speedNote = `${clickDelayMs}ms between each`;

  if (loopEnabled) {
    const durationLabel = unitSelect.value === 'min'
      ? `${durationInput.value || 1}min`
      : `${durationInput.value || 1}s`;
    previewText.innerHTML = `
      <span class="em-preview">${emojiStr}</span><br>
      <strong>${total} reactions</strong> per burst (${timesPerEmoji}× each) · ${speedNote}<br>
      Bursts repeat for <strong>${durationLabel}</strong>, then auto-stop
    `;
  } else {
    previewText.innerHTML = `
      <span class="em-preview">${emojiStr}</span><br>
      Sends <strong>${total} reactions</strong> once (${timesPerEmoji}× each) · ${speedNote}<br>
      Stops automatically after one burst
    `;
  }
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
mainBtn.addEventListener('click', async () => {
  isRunning ? await stopReactor() : await startReactor();
});

async function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]));
  });
}

async function startReactor() {
  if (selectedEmojis.size === 0) {
    previewText.innerHTML = '⚠️ Please select at least one reaction emoji!';
    return;
  }

  const tab = await getCurrentTab();
  if (!tab || !tab.url || !tab.url.includes('meet.google.com')) {
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('notMeet').style.display = 'block';
    return;
  }

  const config = {
    reactions: [...selectedEmojis].map(emoji => ({ emoji, count: timesPerEmoji })),
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
  } catch (e) {
    previewText.innerHTML = `⚠️ Could not connect to Meet tab. Reload the Meet page and try again.`;
  }
}

async function stopReactor() {
  const tab = await getCurrentTab();
  if (tab) {
    try { await chrome.tabs.sendMessage(tab.id, { action: 'STOP' }); } catch(e) {}
  }
  isRunning = false;
  chrome.storage.local.set({ isRunning: false });
  setRunningUI(false);
  if (statInterval) { clearInterval(statInterval); statInterval = null; }
}

function setRunningUI(running) {
  isRunning = running;
  if (running) {
    mainBtn.textContent = '⏹ Stop Reactor';
    mainBtn.classList.add('running');
    statusBadge.textContent = 'LIVE';
    statusBadge.classList.add('active');
    statsRow.style.display = 'flex';
  } else {
    mainBtn.textContent = '🚀 Start Reactor';
    mainBtn.classList.remove('running');
    statusBadge.textContent = 'IDLE';
    statusBadge.classList.remove('active');
    statsRow.style.display = 'none';
    statClicks.textContent = '0';
    statNext.textContent = '—';
  }
}

function startStatPoller(tabId) {
  if (statInterval) clearInterval(statInterval);

  statInterval = setInterval(async () => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (res && res.running) {
        statClicks.textContent = res.stats?.totalClicks || 0;
        if (loopEnabled && res.endTime) {
          const secsLeft = Math.max(0, (res.endTime - Date.now()) / 1000);
          statNext.textContent = secsLeft < 1 ? '<1' : Math.ceil(secsLeft);
        }
      } else {
        setRunningUI(false);
        clearInterval(statInterval);
      }
    } catch (e) {
      setRunningUI(false);
      clearInterval(statInterval);
    }
  }, 1000);
}

// ── Persist settings ──────────────────────────────────────────────────────────
function saveSettings() {
  chrome.storage.local.set({
    selectedEmojis: [...selectedEmojis],
    timesPerEmoji,
    loopEnabled,
    clickDelayMs,
    durationValue: parseFloat(durationInput.value) || 1,
    durationUnit: unitSelect.value,
  });
}

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['selectedEmojis', 'timesPerEmoji', 'loopEnabled', 'clickDelayMs', 'durationValue', 'durationUnit', 'isRunning', 'config'],
      data => {
        if (data.selectedEmojis) {
          data.selectedEmojis.forEach(e => {
            selectedEmojis.add(e);
            const card = emojiGrid.querySelector(`[data-emoji="${e}"]`);
            if (card) card.classList.add('selected');
          });
        }
        if (data.timesPerEmoji)  { timesPerEmoji = data.timesPerEmoji; countValEl.textContent = timesPerEmoji; }
        if (data.loopEnabled !== undefined) { loopEnabled = data.loopEnabled; loopToggle.checked = loopEnabled; }
        if (data.clickDelayMs)  { clickDelayMs = data.clickDelayMs; speedSlider.value = clickDelayMs; }
        if (data.durationValue) durationInput.value = data.durationValue;
        if (data.durationUnit)  unitSelect.value = data.durationUnit;
        resolve(data);
      }
    );
  });
}

// Listen for content script events
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CLICK_SUCCESS') {
    statClicks.textContent = message.total;
  }
  if (message.type === 'STOPPED') {
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
    if (tab && tab.url && tab.url.includes('meet.google.com')) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        if (res && res.running) {
          isRunning = true;
          setRunningUI(true);
          startStatPoller(tab.id);
        }
      } catch(e) {
        chrome.storage.local.set({ isRunning: false });
      }
    }
  }
}

init();
