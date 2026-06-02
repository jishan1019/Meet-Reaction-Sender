// Meet Reactor - Content Script
// Listens for messages from popup and auto-clicks reactions

let reactionInterval = null;
let reactionQueue = [];
let queueIndex = 0;
let sessionStats = { totalClicks: 0, startTime: null };

// Map emojis that Meet may display under a different code point
// e.g. ❤️ vs 💖 — keep both so we can try fallbacks
const EMOJI_ALIASES = {
  '❤️': ['❤️', '💖', '❤'],
  '💖': ['💖', '❤️', '❤'],
};

function getAliases(emoji) {
  return EMOJI_ALIASES[emoji] || [emoji];
}

function findReactionButton(emoji) {
  const aliases = getAliases(emoji);

  // --- Strategy 1: match [data-emoji] attribute (most reliable) ---
  for (const alias of aliases) {
    const btn = document.querySelector(`button[data-emoji="${alias}"]`);
    if (btn) return btn;
  }

  // --- Strategy 2: match aria-label exactly equal to the emoji char ---
  for (const alias of aliases) {
    const btn = document.querySelector(`button[aria-label="${alias}"]`);
    if (btn) return btn;
  }

  // --- Strategy 3: search all buttons whose aria-label IS the emoji char ---
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    const ariaLabel = btn.getAttribute('aria-label') || '';
    for (const alias of aliases) {
      if (ariaLabel === alias || ariaLabel.trim() === alias.trim()) {
        return btn;
      }
    }
  }

  // --- Strategy 4: button whose text content contains the emoji ---
  for (const btn of allButtons) {
    const text = (btn.textContent || '').trim();
    for (const alias of aliases) {
      if (text === alias || text.includes(alias)) return btn;
    }
  }

  return null;
}

function openReactionPanel() {
  // Google Meet reaction/emoji button selectors (ordered by specificity)
  const selectors = [
    // Current Meet DOM — the "Send a reaction" smiley button in bottom bar
    'button[aria-label="Send a reaction"]',
    'button[aria-label="send a reaction" i]',
    'button[jsname="A5Il2c"]',
    'button[jsname="Kd8gCe"]',
    'button[jsname="R3Eqid"]',
    // Broader fallbacks
    'button[aria-label*="reaction" i]',
    'button[aria-label*="emoji" i]',
    'button[aria-label*="React" i]',
    'button[data-tooltip*="reaction" i]',
  ];

  for (const sel of selectors) {
    const btn = document.querySelector(sel);
    if (btn) {
      btn.click();
      return true;
    }
  }

  // Final fallback: scan all buttons for any reaction-related label
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('react') || label.includes('emoji') || label.includes('send reaction')) {
      btn.click();
      return true;
    }
  }

  return false;
}

// Check whether the reaction tray is already visible
function isReactionPanelOpen() {
  // The reaction toolbar has role="toolbar" and aria-label="Send a reaction"
  const toolbar = document.querySelector('[role="toolbar"][aria-label="Send a reaction"]');
  if (toolbar) return true;

  // Alternatively look for a visible button with data-emoji in it
  const emojiBtn = document.querySelector('button[data-emoji]');
  return !!emojiBtn;
}

async function clickReaction(emoji) {
  // Step 1: Open reaction panel only if not already open
  if (!isReactionPanelOpen()) {
    openReactionPanel();
    // Wait for panel to animate open
    await new Promise(r => setTimeout(r, 700));
  }

  // Step 2: Find and click the emoji button
  const btn = findReactionButton(emoji);
  if (btn) {
    // Dispatch real mouse events so Meet's JS framework registers the click
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    btn.click();
    sessionStats.totalClicks++;
    notifyPopup({ type: 'CLICK_SUCCESS', emoji, total: sessionStats.totalClicks });
    return true;
  }

  notifyPopup({ type: 'CLICK_FAILED', emoji });
  return false;
}

function notifyPopup(data) {
  chrome.runtime.sendMessage(data).catch(() => {});
}

function startReactions(config) {
  stopReactions();

  reactionQueue = config.reactions; // [{emoji, count}]
  queueIndex = 0;
  sessionStats = { totalClicks: 0, startTime: Date.now() };

  // Flatten queue into a sequence
  const sequence = [];
  for (const item of reactionQueue) {
    for (let i = 0; i < (item.count || 1); i++) {
      sequence.push(item.emoji);
    }
  }

  if (sequence.length === 0) return;

  let seqIndex = 0;
  const intervalMs = config.intervalMinutes * 60 * 1000;

  // Click immediately on start
  clickReaction(sequence[seqIndex % sequence.length]);
  seqIndex++;

  reactionInterval = setInterval(() => {
    clickReaction(sequence[seqIndex % sequence.length]);
    seqIndex++;
  }, intervalMs);

  notifyPopup({ type: 'STARTED', startTime: sessionStats.startTime });
}

function stopReactions() {
  if (reactionInterval) {
    clearInterval(reactionInterval);
    reactionInterval = null;
  }
  notifyPopup({ type: 'STOPPED', total: sessionStats.totalClicks });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START') {
    startReactions(message.config);
    sendResponse({ ok: true });
  } else if (message.action === 'STOP') {
    stopReactions();
    sendResponse({ ok: true, total: sessionStats.totalClicks });
  } else if (message.action === 'PING') {
    sendResponse({ ok: true, running: reactionInterval !== null, stats: sessionStats });
  }
  return true;
});
