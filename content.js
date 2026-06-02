// Meet Reactor - Content Script
// Listens for messages from popup and auto-clicks reactions

let burstTimeout = null;      // holds the setTimeout id for burst scheduling
let sessionStats = { totalClicks: 0, startTime: null };
let isActive = false;

// ─── Heart alias: Meet shows 💖 for ❤️ ───────────────────────────────────────
const EMOJI_ALIASES = {
  '❤️': ['❤️', '💖', '❤'],
  '💖': ['💖', '❤️', '❤'],
};

function getAliases(emoji) {
  return EMOJI_ALIASES[emoji] || [emoji];
}

// ─── Is the reaction tray currently VISIBLE? ─────────────────────────────────
function isReactionPanelOpen() {
  const toolbar = document.querySelector(
    '[role="toolbar"][aria-label="Send a reaction"], .kHVWGc[role="toolbar"]'
  );
  if (!toolbar) return false;
  const rect = toolbar.getBoundingClientRect();
  // Must be painted on screen with real dimensions
  return rect.width > 0 && rect.height > 0;
}

// ─── Click the bottom-bar button that OPENS the reaction tray ────────────────
function openReactionPanel() {
  if (isReactionPanelOpen()) return true; // already visible

  // Selectors for the toggle button in Meet's bottom controls bar.
  // We must NOT match buttons that are INSIDE the reaction tray itself.
  const selectors = [
    'button[jsname="A5Il2c"]',
    'button[jsname="Kd8gCe"]',
    'button[jsname="R3Eqid"]',
    // aria-label variants used by Meet for the toggle button
    'button[aria-label="Send a reaction"]',
    'button[aria-label*="reaction" i]',
    'button[aria-label*="emoji" i]',
    'button[data-tooltip*="reaction" i]',
    'button[data-tooltip*="emoji" i]',
  ];

  for (const sel of selectors) {
    const all = document.querySelectorAll(sel);
    for (const btn of all) {
      // Skip any button that lives inside the tray itself
      if (btn.closest('[role="toolbar"][aria-label*="reaction" i]')) continue;
      if (btn.closest('.kHVWGc')) continue;

      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
      btn.click();
      return true;
    }
  }

  // Last resort: any button in the page whose aria-label mentions "react"
  for (const btn of document.querySelectorAll('button')) {
    if (btn.closest('[role="toolbar"][aria-label*="reaction" i]')) continue;
    if (btn.closest('.kHVWGc')) continue;
    const lbl = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (lbl.includes('react') || lbl === 'emoji') {
      btn.click();
      return true;
    }
  }

  return false;
}

// ─── Find the emoji button inside the open tray ──────────────────────────────
function findReactionButton(emoji) {
  const aliases = getAliases(emoji);

  // 1. data-emoji attribute on <button>
  for (const a of aliases) {
    const btn = document.querySelector(`button[data-emoji="${a}"]`);
    if (btn) return btn;
  }

  // 2. aria-label exactly equal to the emoji char
  for (const a of aliases) {
    const btn = document.querySelector(`button[aria-label="${a}"]`);
    if (btn) return btn;
  }

  // 3. Walk all buttons
  for (const btn of document.querySelectorAll('button')) {
    const lbl = btn.getAttribute('aria-label') || '';
    for (const a of aliases) {
      if (lbl === a || lbl.trim() === a.trim()) return btn;
    }
  }

  return null;
}

// ─── Ensure panel is open (fast: one 300ms wait max) ────────────────────────
async function ensurePanelOpen() {
  if (isReactionPanelOpen()) return true;
  openReactionPanel();
  await sleep(300);
  if (isReactionPanelOpen()) return true;
  // One extra attempt
  openReactionPanel();
  await sleep(300);
  return isReactionPanelOpen();
}

// ─── Click a single emoji reaction ───────────────────────────────────────────
async function clickReaction(emoji) {
  await ensurePanelOpen();

  const btn = findReactionButton(emoji);
  if (!btn) {
    notifyPopup({ type: 'CLICK_FAILED', emoji });
    return false;
  }

  btn.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent('click',      { bubbles: true, cancelable: true }));
  btn.click();

  sessionStats.totalClicks++;
  notifyPopup({ type: 'CLICK_SUCCESS', emoji, total: sessionStats.totalClicks });
  return true;
}

// ─── Send one full burst (true random-pick-with-replacement) ────────────────
//  Each click independently picks a random emoji from the weighted pool.
//  This means no clumps — you never predict what's next.
//  Speed: 400 ms between clicks (~5 reactions per 2 seconds).
async function sendBurst(reactionQueue) {
  // Build weighted pool: emoji appears N times = N times more likely
  const pool = [];
  for (const { emoji, count } of reactionQueue) {
    for (let i = 0; i < count; i++) pool.push(emoji);
  }
  if (pool.length === 0) return;

  const totalClicks = pool.length;

  for (let i = 0; i < totalClicks; i++) {
    if (!isActive) return;
    // Pick a FRESH random emoji each time — true randomness, no sequence
    const emoji = pool[Math.floor(Math.random() * pool.length)];
    await clickReaction(emoji);
    await sleep(400); // 400 ms → ~5 reactions per 2 s
  }
}

// ─── Schedule repeated bursts ────────────────────────────────────────────────
function scheduleBurst(reactionQueue, intervalMs) {
  if (!isActive) return;

  sendBurst(reactionQueue).then(() => {
    if (!isActive) return;
    burstTimeout = setTimeout(() => scheduleBurst(reactionQueue, intervalMs), intervalMs);
    notifyPopup({ type: 'NEXT_BURST', at: Date.now() + intervalMs });
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────
function startReactions(config) {
  stopReactions();

  if (!config.reactions || config.reactions.length === 0) return;

  isActive = true;
  sessionStats = { totalClicks: 0, startTime: Date.now() };

  const intervalMs = (config.intervalMinutes || 1) * 60 * 1000;

  // Send first burst immediately, then repeat every intervalMs
  scheduleBurst(config.reactions, intervalMs);

  notifyPopup({ type: 'STARTED', startTime: sessionStats.startTime });
}

// ─── Stop ────────────────────────────────────────────────────────────────────
function stopReactions() {
  isActive = false;
  if (burstTimeout) {
    clearTimeout(burstTimeout);
    burstTimeout = null;
  }
  notifyPopup({ type: 'STOPPED', total: sessionStats.totalClicks });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Fisher-Yates shuffle — returns a new shuffled array
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function notifyPopup(data) {
  chrome.runtime.sendMessage(data).catch(() => {});
}

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START') {
    startReactions(message.config);
    sendResponse({ ok: true });
  } else if (message.action === 'STOP') {
    stopReactions();
    sendResponse({ ok: true, total: sessionStats.totalClicks });
  } else if (message.action === 'PING') {
    sendResponse({ ok: true, running: isActive, stats: sessionStats });
  }
  return true;
});
