# ⚡ Meet Reactor – Chrome Extension

Auto-send reactions in Google Meet on a schedule!

## 📦 Installation (Developer Mode)

1. **Download & unzip** this folder somewhere on your computer.
2. Open Chrome and go to: `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner).
4. Click **"Load unpacked"**.
5. Select the `meet-reactor` folder.
6. The extension icon will appear in your toolbar! 🎉

## 🚀 How to Use

1. Join a **Google Meet** call.
2. Click the ⚡ Meet Reactor icon in Chrome's toolbar.
3. Set the **interval** (e.g. `1` = fire every 1 minute, `0.5` = every 30 seconds).
4. **Click the emojis** you want to send (you can pick multiple — they rotate).
5. Set **clicks per interval** (how many times to react each round).
6. Click **🚀 Start Reactor** — reactions fire automatically!
7. Click **⏹ Stop Reactor** to stop.

## 📋 Features

- ⏱ Set any interval (supports decimals like 0.5 min = 30 sec)
- 🎯 Choose multiple reactions — they rotate in sequence
- 🔢 Set how many clicks per interval
- 📊 Live stats: reactions sent + time until next fire
- 💾 Remembers your settings between sessions
- ✅ Works only on meet.google.com (safe)

## ⚠️ Notes

- Keep the **Meet tab open and active** — reactions need the page to be loaded
- The extension opens the Meet reaction tray and clicks the button automatically
- Works best when Google Meet's reaction bar is visible at the bottom of the call
- If reactions don't fire, try clicking manually once to make sure the reaction panel works

## 🛠 Troubleshooting

**"Could not connect to Meet tab"** → Reload your Google Meet tab and try again.

**Reactions not appearing** → Google Meet may have updated their UI. The extension looks for reaction buttons by aria-label — if Meet changes their HTML, the selectors may need updating.
