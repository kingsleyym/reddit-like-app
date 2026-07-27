"use strict";

// Central-server mode: runs ONLY the web server (dashboard + player pages +
// video hosting), with no Electron and no local kiosk windows. This is what
// the mini-PC in the server room runs; the Samsung displays open the player
// pages themselves via their built-in URL Launcher over the network.
//
// Start with:  node standalone.js
// Data (videos + config) is stored in %ProgramData%\MenuBoard (Windows) or
// ~/.menuboard elsewhere. Override with the MENUBOARD_DATA env var.

const path = require("path");
const os = require("os");
const { Store } = require("./server/store");
const { startServer } = require("./server");
const { ensureFirewallRule } = require("./electron/firewall");

const PORT = Number(process.env.MENUBOARD_PORT) || 8787;

function dataDir() {
  if (process.env.MENUBOARD_DATA) return process.env.MENUBOARD_DATA;
  if (process.platform === "win32") {
    return path.join(process.env.ProgramData || "C:\\ProgramData", "MenuBoard");
  }
  return path.join(os.homedir(), ".menuboard");
}

let version = "server";
try {
  version = require("./package.json").version;
} catch (_) {}

async function main() {
  const dir = dataDir();
  const store = new Store(path.join(dir, "config.json"));

  // Open the Windows firewall so the displays/phone can reach this server.
  await ensureFirewallRule(PORT).catch(() => {});

  const info = await startServer({
    store,
    mediaDir: path.join(dir, "media"),
    port: PORT,
    version,
    getDisplays: () => [], // no local monitors in server mode
  });

  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) ips.push(i.address);
    }
  }
  console.log("========================================");
  console.log(" MenuBoard server läuft (v" + version + ")");
  console.log(" Daten-Ordner: " + dir);
  console.log(" Dashboard:    http://localhost:" + PORT);
  for (const ip of ips) console.log("               http://" + ip + ":" + PORT);
  console.log(" Displays:     http://<diese-IP>:" + PORT + "/player?screen=1 (2,3,4)");
  console.log("========================================");
  return info;
}

main().catch((err) => {
  console.error("MenuBoard server failed to start:", err);
  process.exit(1);
});
