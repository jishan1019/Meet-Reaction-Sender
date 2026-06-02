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
let countPerInterval = 1;
let isRunning = false;
let statInterval = null;
let nextFireTime = null;

// DOM refs
const emojiGrid = document.getElementById('emojiGrid');
const intervalInput = document.getElementById('intervalInput');
const countValEl = document.getElementById('countVal');
const previewText = document.getElementById('previewText');
const mainBtn = document.getElementById('mainBtn');
const statusBadge = document.getElementById('statusBadge');
const statsRow = document.getElementById('statsRow');
const statClicks = document.getElementById('statClicks');
const statNext = document.getElementById('statNext');

// Build emoji grid
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

function updatePreview() {
  const selected = [...selectedEmojis];
  const interval = parseFloat(intervalInput.value) || 1;
  const count = countPerInterval;

  if (selected.length === 0) {
    previewText.innerHTML = 'Select reactions above to preview schedule…';
    return;
  }

  const emojiStr = selected.join(' ');
  const times = count > 1 ? `${count}× each` : 'once each';
  const intervalStr = interval < 1 ? `${Math.round(interval * 60)}s` : `${interval}min`;

  previewText.innerHTML = `
    <span class="em-preview">${emojiStr}</span><br>
    Sends <strong>${times}</strong> every <strong>${intervalStr}</strong><br>
    Selected: ${selected.length} reaction${selected.length > 1 ? 's' : ''} in rotation
  `;
}

// Stepper
document.getElementById('countDown').addEventListener('click', () => {
  if (countPerInterval > 1) { countPerInterval--; countValEl.textContent = countPerInterval; }
  updatePreview(); saveSettings();
});
document.getElementById('countUp').addEventListener('click', () => {
  if (countPerInterval < 10) { countPerInterval++; countValEl.textContent = countPerInterval; }
  updatePreview(); saveSettings();
});

intervalInput.addEventListener('input', () => { updatePreview(); saveSettings(); });

// Start / Stop
mainBtn.addEventListener('click', async () => {
  if (isRunning) {
    await stopReactor();
  } else {
    await startReactor();
  }
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
    reactions: [...selectedEmojis].map(emoji => ({ emoji, count: countPerInterval })),
    intervalMinutes: parseFloat(intervalInput.value) || 1,
  };

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'START', config });
    isRunning = true;
    nextFireTime = Date.now() + config.intervalMinutes * 60 * 1000;

    // Save running state
    chrome.storage.local.set({ isRunning: true, config, nextFireTime });

    setRunningUI(true);
    startStatPoller(tab.id, config.intervalMinutes);
  } catch (e) {
    previewText.innerHTML = `⚠️ Could not connect to Meet tab. Reload the Meet page and try again.`;
  }
}

async function stopReactor() {
  const tab = await getCurrentTab();
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'STOP' });
    } catch(e) {}
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

function startStatPoller(tabId, intervalMinutes) {
  if (statInterval) clearInterval(statInterval);

  statInterval = setInterval(async () => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (res && res.running) {
        statClicks.textContent = res.stats?.totalClicks || 0;

        if (nextFireTime) {
          const mins = Math.max(0, (nextFireTime - Date.now()) / 60000);
          statNext.textContent = mins < 1 ? '<1' : mins.toFixed(1);
        } else {
          statNext.textContent = '…';
        }
      } else {
        setRunningUI(false);
        clearInterval(statInterval);
      }
    } catch (e) {
      // Tab closed or navigated away
      setRunningUI(false);
      clearInterval(statInterval);
    }
  }, 2000);
}

function saveSettings() {
  chrome.storage.local.set({
    selectedEmojis: [...selectedEmojis],
    countPerInterval,
    intervalMinutes: parseFloat(intervalInput.value) || 1,
  });
}

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['selectedEmojis', 'countPerInterval', 'intervalMinutes', 'isRunning', 'config', 'nextFireTime'], data => {
      if (data.selectedEmojis) {
        data.selectedEmojis.forEach(e => {
          selectedEmojis.add(e);
          const card = emojiGrid.querySelector(`[data-emoji="${e}"]`);
          if (card) card.classList.add('selected');
        });
      }
      if (data.countPerInterval) {
        countPerInterval = data.countPerInterval;
        countValEl.textContent = countPerInterval;
      }
      if (data.intervalMinutes) {
        intervalInput.value = data.intervalMinutes;
      }
      if (data.nextFireTime) nextFireTime = data.nextFireTime;
      resolve(data);
    });
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CLICK_SUCCESS') {
    statClicks.textContent = message.total;
  }
  if (message.type === 'NEXT_BURST') {
    // Content script tells us when the next burst will fire
    nextFireTime = message.at;
  }
  if (message.type === 'STOPPED') {
    setRunningUI(false);
  }
});

// Init
async function init() {
  buildGrid();
  const data = await loadSettings();
  updatePreview();

  // Check if reactor was already running
  if (data.isRunning) {
    const tab = await getCurrentTab();
    if (tab && tab.url && tab.url.includes('meet.google.com')) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        if (res && res.running) {
          isRunning = true;
          setRunningUI(true);
          startStatPoller(tab.id, parseFloat(intervalInput.value) || 1);
        }
      } catch(e) {
        chrome.storage.local.set({ isRunning: false });
      }
    }
  }
}

init();
