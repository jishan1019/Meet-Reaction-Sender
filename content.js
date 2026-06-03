let sessionStats = { totalClicks: 0, startTime: null };
let isActive = false;
let sessionEndTime = null;

// ─── Heart alias: Meet shows 💖 for ❤️ ───────────────────────────────────────
const EMOJI_ALIASES = {
  "❤️": ["❤️", "💖", "❤"],
  "💖": ["💖", "❤️", "❤"],
};

function getAliases(emoji) {
  return EMOJI_ALIASES[emoji] || [emoji];
}

// ─── Is the reaction tray currently VISIBLE? ─────────────────────────────────
function isReactionPanelOpen() {
  const toolbar = document.querySelector(
    '[role="toolbar"][aria-label="Send a reaction"], .kHVWGc[role="toolbar"]',
  );
  if (!toolbar) return false;
  const rect = toolbar.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// ─── Click the bottom-bar button that OPENS the reaction tray ────────────────
function openReactionPanel() {
  if (isReactionPanelOpen()) return true;

  const selectors = [
    'button[jsname="A5Il2c"]',
    'button[jsname="Kd8gCe"]',
    'button[jsname="R3Eqid"]',
    'button[aria-label="Send a reaction"]',
    'button[aria-label*="reaction" i]',
    'button[aria-label*="emoji" i]',
    'button[data-tooltip*="reaction" i]',
    'button[data-tooltip*="emoji" i]',
  ];

  for (const sel of selectors) {
    const all = document.querySelectorAll(sel);
    for (const btn of all) {
      if (btn.closest('[role="toolbar"][aria-label*="reaction" i]')) continue;
      if (btn.closest(".kHVWGc")) continue;

      btn.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      btn.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
      btn.click();
      return true;
    }
  }

  for (const btn of document.querySelectorAll("button")) {
    if (btn.closest('[role="toolbar"][aria-label*="reaction" i]')) continue;
    if (btn.closest(".kHVWGc")) continue;
    const lbl = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (lbl.includes("react") || lbl === "emoji") {
      btn.click();
      return true;
    }
  }

  return false;
}

// ─── Find the emoji button inside the open tray ──────────────────────────────
function findReactionButton(emoji) {
  const aliases = getAliases(emoji);

  for (const a of aliases) {
    const btn = document.querySelector(`button[data-emoji="${a}"]`);
    if (btn) return btn;
  }

  for (const a of aliases) {
    const btn = document.querySelector(`button[aria-label="${a}"]`);
    if (btn) return btn;
  }

  for (const btn of document.querySelectorAll("button")) {
    const lbl = btn.getAttribute("aria-label") || "";
    for (const a of aliases) {
      if (lbl === a || lbl.trim() === a.trim()) return btn;
    }
  }

  return null;
}

// ─── Ensure panel is open ────────────────────────────────────────────────────
async function ensurePanelOpen() {
  if (isReactionPanelOpen()) return true;
  openReactionPanel();
  await sleep(300);
  if (isReactionPanelOpen()) return true;
  openReactionPanel();
  await sleep(300);
  return isReactionPanelOpen();
}

// ─── Click a single emoji reaction ───────────────────────────────────────────
async function clickReaction(emoji) {
  await ensurePanelOpen();

  const btn = findReactionButton(emoji);
  if (!btn) {
    notifyPopup({ type: "CLICK_FAILED", emoji });
    return false;
  }

  btn.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  btn.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
  btn.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
  );
  btn.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  btn.click();

  sessionStats.totalClicks++;
  notifyPopup({
    type: "CLICK_SUCCESS",
    emoji,
    total: sessionStats.totalClicks,
  });
  return true;
}

// ─── Send one burst: each emoji × count times, randomly shuffled ─────────────
async function sendBurst(reactions, delayMs) {
  const pool = [];
  for (const { emoji, count } of reactions) {
    for (let i = 0; i < count; i++) pool.push(emoji);
  }
  if (pool.length === 0) return;

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  for (const emoji of pool) {
    if (!isActive) return;
    await clickReaction(emoji);
    await sleep(delayMs);
  }
}

// ─── Loop mode: repeat bursts until duration expires ─────────────────────────
async function runLoopSession(reactions, delayMs) {
  while (isActive && Date.now() < sessionEndTime) {
    await sendBurst(reactions, delayMs);
  }
  if (isActive) stopReactions();
}

// ─── One-shot mode: single burst then stop ───────────────────────────────────
async function runOnceSession(reactions, delayMs) {
  await sendBurst(reactions, delayMs);
  if (isActive) stopReactions();
}

// ─── Start ───────────────────────────────────────────────────────────────────
function startReactions(config) {
  stopReactions();

  if (!config.reactions || config.reactions.length === 0) return;

  isActive = true;
  sessionStats = { totalClicks: 0, startTime: Date.now() };
  const delayMs = config.clickDelayMs || 400;

  if (config.loopEnabled) {
    sessionEndTime = Date.now() + (config.durationSeconds || 60) * 1000;
    runLoopSession(config.reactions, delayMs);
  } else {
    sessionEndTime = null;
    runOnceSession(config.reactions, delayMs);
  }

  notifyPopup({ type: "STARTED", startTime: sessionStats.startTime });
}

// ─── Stop ────────────────────────────────────────────────────────────────────
function stopReactions() {
  isActive = false;
  sessionEndTime = null;
  notifyPopup({ type: "STOPPED", total: sessionStats.totalClicks });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function notifyPopup(data) {
  chrome.runtime.sendMessage(data).catch(() => {});
}

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START") {
    startReactions(message.config);
    sendResponse({ ok: true });
  } else if (message.action === "STOP") {
    stopReactions();
    sendResponse({ ok: true, total: sessionStats.totalClicks });
  } else if (message.action === "PING") {
    sendResponse({
      ok: true,
      running: isActive,
      stats: sessionStats,
      endTime: sessionEndTime,
    });
  }
  return true;
});
