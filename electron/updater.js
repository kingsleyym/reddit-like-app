"use strict";

// Automatic updates via GitHub Releases (electron-updater). When a new version
// is published to the repo's Releases, every installed board downloads it in
// the background and installs it during quiet hours so service is never
// interrupted. Only runs in the packaged app, never in dev.

const { app } = require("electron");

let updateReady = false;

function setupAutoUpdate() {
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    autoUpdater = require("electron-updater").autoUpdater;
  } catch (e) {
    console.error("[updater] not available:", e.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", () => {
    updateReady = true;
  });
  autoUpdater.on("error", (e) => console.error("[updater]", e && e.message));

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 6 * 60 * 60 * 1000); // re-check every 6 hours

  // Install a downloaded update only outside business hours (before 08:00 or
  // from 23:00), so the menu board is never restarted mid-service.
  setInterval(() => {
    if (!updateReady) return;
    const h = new Date().getHours();
    if (h < 8 || h >= 23) autoUpdater.quitAndInstall(true, true);
  }, 30 * 60 * 1000);
}

module.exports = { setupAutoUpdate };
