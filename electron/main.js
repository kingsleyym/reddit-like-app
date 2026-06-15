"use strict";

const { app, BrowserWindow, screen, powerSaveBlocker, globalShortcut } = require("electron");
const path = require("path");
const { Store } = require("../server/store");
const { startServer } = require("../server");
const { applySchedule, runPowerAction } = require("./power");

const PORT = 8787;

let store;
let playerWindows = {}; // slot -> BrowserWindow
let dashboardWindow = null;
let quitting = false;
let serverInfo = null;

const SLOTS = ["left", "middle", "right"];

function userDataPaths() {
  const base = app.getPath("userData");
  return {
    dataFile: path.join(base, "config.json"),
    mediaDir: path.join(base, "media"),
  };
}

/**
 * Decide which physical display each logical slot should use.
 * Default: sort displays left-to-right by x position. A manual mapping
 * from the dashboard (slot -> display id) overrides the automatic order.
 */
function resolveDisplaysForSlots() {
  const displays = screen.getAllDisplays();
  const sorted = [...displays].sort((a, b) => a.bounds.x - b.bounds.x);
  const mapping = store.getState().displayMapping || {};
  const result = {};

  SLOTS.forEach((slot, index) => {
    let display = null;
    if (mapping[slot] != null) {
      display = displays.find((d) => d.id === mapping[slot]) || null;
    }
    if (!display) {
      display = sorted[index] || null; // may be null if fewer monitors
    }
    result[slot] = display;
  });
  return result;
}

function playerUrl(slot) {
  return `http://127.0.0.1:${PORT}/player?screen=${slot}`;
}

function createPlayerWindow(slot, display) {
  if (!display) return; // no monitor for this slot

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(playerUrl(slot));

  // Auto-recover: if a player window dies while we are still running,
  // recreate it on the same display so the board never stays black.
  win.on("closed", () => {
    playerWindows[slot] = null;
    if (!quitting) {
      setTimeout(() => {
        const displays = resolveDisplaysForSlots();
        createPlayerWindow(slot, displays[slot]);
      }, 1500);
    }
  });

  playerWindows[slot] = win;
}

function createAllPlayers() {
  const displays = resolveDisplaysForSlots();
  for (const slot of SLOTS) {
    if (!playerWindows[slot]) {
      createPlayerWindow(slot, displays[slot]);
    }
  }
}

function recreateAllPlayers() {
  for (const slot of SLOTS) {
    const win = playerWindows[slot];
    if (win && !win.isDestroyed()) {
      win.removeAllListeners("closed");
      win.close();
    }
    playerWindows[slot] = null;
  }
  setTimeout(createAllPlayers, 500);
}

// Open the dashboard in a normal (non-kiosk) window on the PC itself.
// Handy when testing on a single monitor where the player covers the desktop.
function openDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus();
    return;
  }
  dashboardWindow = new BrowserWindow({
    width: 480,
    height: 900,
    title: "MenuBoard – Steuerung",
    alwaysOnTop: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  dashboardWindow.loadURL(`http://127.0.0.1:${PORT}/dashboard`);
  dashboardWindow.on("closed", () => {
    dashboardWindow = null;
  });
}

function listDisplays() {
  const sorted = [...screen.getAllDisplays()].sort(
    (a, b) => a.bounds.x - b.bounds.x
  );
  return sorted.map((d, i) => ({
    id: d.id,
    label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height} @ x=${d.bounds.x})`,
    bounds: d.bounds,
    primary: d.id === screen.getPrimaryDisplay().id,
  }));
}

app.whenReady().then(async () => {
  const { dataFile, mediaDir } = userDataPaths();
  store = new Store(dataFile);

  // Keep displays awake so the menu board never sleeps mid-service.
  powerSaveBlocker.start("prevent-display-sleep");

  // Autostart on boot so a power-on always brings the board up.
  try {
    app.setLoginItemSettings({ openAtLogin: true });
  } catch (_) {
    /* ignore on platforms that do not support it */
  }

  serverInfo = await startServer({
    store,
    mediaDir,
    port: PORT,
    onSchedule: (schedule) => applySchedule(schedule),
    onPower: (action) => runPowerAction(action, { recreateAllPlayers }),
    onDisplayMapping: () => recreateAllPlayers(),
    getDisplays: () => listDisplays(),
  });

  createAllPlayers();

  // Maintenance / testing shortcuts (work even over the kiosk windows):
  //   Ctrl+Shift+D  open the dashboard in a window on this PC
  //   Ctrl+Shift+Q  quit the app (e.g. to exit kiosk for maintenance)
  globalShortcut.register("CommandOrControl+Shift+D", openDashboardWindow);
  globalShortcut.register("CommandOrControl+Shift+Q", () => {
    quitting = true;
    app.quit();
  });

  // Re-apply the saved schedule on every launch so a wake task always exists.
  const sched = store.getState().schedule;
  if (sched && sched.enabled) {
    applySchedule(sched).catch((e) =>
      console.error("[main] schedule apply failed:", e.message)
    );
  }

  // If monitors are plugged in/out, rebuild the player windows.
  screen.on("display-added", recreateAllPlayers);
  screen.on("display-removed", recreateAllPlayers);
  screen.on("display-metrics-changed", recreateAllPlayers);
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Keep running even if all windows close (auto-recreate handles it),
// but on macOS / dev the standard behavior is fine.
app.on("window-all-closed", () => {
  if (quitting && process.platform !== "darwin") {
    app.quit();
  }
});
