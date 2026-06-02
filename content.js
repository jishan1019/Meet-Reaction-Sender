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

// ─── Open panel (with retry) then click emoji ────────────────────────────────
async function clickReaction(emoji) {
  // Open panel if needed; retry up to 3 times
  if (!isReactionPanelOpen()) {
    openReactionPanel();
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(600);
      if (isReactionPanelOpen()) break;
      openReactionPanel(); // try again
    }
  }

  const btn = findReactionButton(emoji);
  if (!btn) {
    notifyPopup({ type: 'CLICK_FAILED', emoji });
    return false;
  }

  btn.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent('click',      { bubbles: true, cancelable: true }));
  btn.click(); // belt-and-suspenders

  sessionStats.totalClicks++;
  notifyPopup({ type: 'CLICK_SUCCESS', emoji, total: sessionStats.totalClicks });
  return true;
}

// ─── Send one full burst of all selected emojis (random order) ──────────────
//   Flatten queue into individual emoji entries, shuffle them, then click
//   with 2 s between each so Meet registers every reaction.
async function sendBurst(reactionQueue) {
  // Build flat list: each emoji repeated by its count
  const flat = [];
  for (const { emoji, count } of reactionQueue) {
    for (let i = 0; i < count; i++) flat.push(emoji);
  }

  // Randomise order every burst
  const randomised = shuffle(flat);

  for (const emoji of randomised) {
    if (!isActive) return; // stopped mid-burst
    await clickReaction(emoji);
    await sleep(2000); // 2 s between each reaction click
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
