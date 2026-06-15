"use strict";

const {
  app,
  BrowserWindow,
  screen,
  powerSaveBlocker,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  shell,
} = require("electron");
const path = require("path");
const os = require("os");
const { Store } = require("../server/store");
const { startServer } = require("../server");
const { applySchedule, runPowerAction } = require("./power");
const { ensureFirewallRule } = require("./firewall");

const PORT = 8787;
const SLOTS = ["left", "middle", "right"];

let store;
let playerWindows = {};
let dashboardWindow = null;
let tray = null;
let quitting = false;
let maintenance = false; // when true, players are closed and do not auto-reopen
let mediaDir = null;
let serverInfo = null;

function userDataPaths() {
  const base = app.getPath("userData");
  return {
    dataFile: path.join(base, "config.json"),
    mediaDir: path.join(base, "media"),
  };
}

function resolveDisplaysForSlots() {
  const displays = screen.getAllDisplays();
  const sorted = [...displays].sort((a, b) => a.bounds.x - b.bounds.x);
  const mapping = store.getState().displayMapping || {};
  const result = {};
  SLOTS.forEach((slot, index) => {
    let display = null;
    if (mapping[slot] != null) display = displays.find((d) => d.id === mapping[slot]) || null;
    if (!display) display = sorted[index] || null;
    result[slot] = display;
  });
  return result;
}

function playerUrl(slot) {
  return `http://127.0.0.1:${PORT}/player?screen=${slot}`;
}

function createPlayerWindow(slot, display) {
  if (!display) return;
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
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(playerUrl(slot));
  win.on("closed", () => {
    playerWindows[slot] = null;
    if (!quitting && !maintenance) {
      setTimeout(() => {
        const displays = resolveDisplaysForSlots();
        createPlayerWindow(slot, displays[slot]);
      }, 1500);
    }
  });
  playerWindows[slot] = win;
}

function createAllPlayers() {
  if (maintenance) return;
  const displays = resolveDisplaysForSlots();
  for (const slot of SLOTS) if (!playerWindows[slot]) createPlayerWindow(slot, displays[slot]);
}

function closeAllPlayers() {
  for (const slot of SLOTS) {
    const win = playerWindows[slot];
    if (win && !win.isDestroyed()) {
      win.removeAllListeners("closed");
      win.close();
    }
    playerWindows[slot] = null;
  }
}

// Maintenance mode: close the fullscreen kiosk players so the Windows desktop
// is usable for configuration, without quitting the app (it stays in the tray).
function applyMaintenance(enabled) {
  maintenance = enabled;
  if (enabled) closeAllPlayers();
  else setTimeout(createAllPlayers, 300);
  if (tray) tray.setContextMenu(buildMenu());
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

function openDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus();
    return;
  }
  dashboardWindow = new BrowserWindow({
    width: 520,
    height: 920,
    title: "MenuBoard – Steuerung",
    backgroundColor: "#0b0d12",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  dashboardWindow.loadURL(`http://127.0.0.1:${PORT}/dashboard`);
  dashboardWindow.on("closed", () => (dashboardWindow = null));
}

function listDisplays() {
  const sorted = [...screen.getAllDisplays()].sort((a, b) => a.bounds.x - b.bounds.x);
  const primaryId = screen.getPrimaryDisplay().id;
  return sorted.map((d, i) => ({
    id: d.id,
    label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
    bounds: d.bounds,
    primary: d.id === primaryId,
  }));
}

// --- Automatic Tag/Abend switching by time of day -------------------------
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function checkAutoSwitch() {
  const st = store.getState();
  const a = st.autoSwitch;
  if (!a || !a.enabled) return;
  const dayStart = toMinutes(a.dayStart);
  const nightStart = toMinutes(a.nightStart);
  if (dayStart == null || nightStart == null) return;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  let target;
  if (dayStart <= nightStart) {
    target = cur >= dayStart && cur < nightStart ? "day" : "night";
  } else {
    target = cur >= dayStart || cur < nightStart ? "day" : "night";
  }
  if (st.liveScene !== target) {
    store.setLiveScene(target);
    if (serverInfo) {
      serverInfo.broadcastState();
      serverInfo.broadcastLive();
    }
  }
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: "Dashboard öffnen", click: openDashboardWindow },
    {
      label: "Dashboard im Browser öffnen",
      click: () => shell.openExternal(`http://localhost:${PORT}/dashboard`),
    },
    { type: "separator" },
    { label: "Player neu starten", click: recreateAllPlayers },
    {
      label: "Wartungsmodus (Player schließen)",
      type: "checkbox",
      checked: maintenance,
      click: (item) => {
        store.setMaintenance(item.checked);
        applyMaintenance(item.checked);
        if (serverInfo) serverInfo.broadcastState();
      },
    },
    { label: "Medien-Ordner öffnen", click: () => mediaDir && shell.openPath(mediaDir) },
    { type: "separator" },
    {
      label: "Beenden",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function buildTray() {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray-icon.png"));
  } catch (_) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip("MenuBoard");
  tray.setContextMenu(buildMenu());
  tray.on("double-click", openDashboardWindow);
}

app.whenReady().then(async () => {
  const paths = userDataPaths();
  mediaDir = paths.mediaDir;
  store = new Store(paths.dataFile);

  // Maintenance is temporary: always start the board running after a launch.
  store.setMaintenance(false);
  maintenance = false;

  powerSaveBlocker.start("prevent-display-sleep");
  try {
    app.setLoginItemSettings({ openAtLogin: store.getState().autostart !== false });
  } catch (_) {}

  // Open the firewall for the dashboard port so the phone can reach the PC
  // over Tailscale / LAN (best-effort; the installer also adds this rule).
  ensureFirewallRule(PORT).catch(() => {});

  serverInfo = await startServer({
    store,
    mediaDir,
    port: PORT,
    onSchedule: (schedule) => applySchedule(schedule),
    onPower: (action) => runPowerAction(action, { recreateAllPlayers }),
    onDisplayMapping: () => recreateAllPlayers(),
    getDisplays: () => listDisplays(),
    onMaintenance: (enabled) => applyMaintenance(enabled),
    onAutostart: (enabled) => {
      try {
        app.setLoginItemSettings({ openAtLogin: enabled });
      } catch (_) {}
    },
    onOpenFolder: () => mediaDir && shell.openPath(mediaDir),
  });

  createAllPlayers();
  buildTray();

  globalShortcut.register("CommandOrControl+Shift+D", openDashboardWindow);
  globalShortcut.register("CommandOrControl+Shift+Q", () => {
    quitting = true;
    app.quit();
  });

  const sched = store.getState().schedule;
  if (sched && sched.enabled) {
    applySchedule(sched).catch((e) => console.error("[main] schedule apply failed:", e.message));
  }

  checkAutoSwitch();
  setInterval(checkAutoSwitch, 30 * 1000);

  screen.on("display-added", recreateAllPlayers);
  screen.on("display-removed", recreateAllPlayers);
  screen.on("display-metrics-changed", recreateAllPlayers);
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  // Keep running in the tray; players auto-recreate. Only quit when asked.
  if (quitting && process.platform !== "darwin") app.quit();
});
