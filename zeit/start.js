"use strict";

/*
 * Kingsley Zeit – Startdatei
 * ===========================
 *   node zeit/start.js
 *
 * Ohne Zusatzpakete. Die Daten landen neben dieser Datei im Ordner "daten"
 * (oder wo ZEIT_DATEN hinzeigt).
 *
 * Zwei Ports, absichtlich getrennt:
 *   8792  PRIVAT       alles inklusive Chef-Bereich. Nur Laden-Netzwerk
 *                      und Tailscale - NIE ins offene Internet.
 *   8794  OEFFENTLICH  nur Stempeln. Dieser Port geht per Tailscale-Funnel
 *                      nach draussen, damit Handys und die iPads der anderen
 *                      Standorte ihn erreichen.
 */

const path = require("path");
const os = require("os");
const { createZeitServer } = require("./server");

const PORT = Number(process.env.ZEIT_PORT) || 8792;
const PUBLIC_PORT = Number(process.env.ZEIT_PORT_OEFFENTLICH) || (PORT + 2);
const DATA = process.env.ZEIT_DATEN || path.join(__dirname, "daten");

function adressen() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const o = i.address.split(".").map(Number);
      const tail = o[0] === 100 && o[1] >= 64 && o[1] <= 127;
      out.push({ ip: i.address, tail });
    }
  }
  out.sort((a, b) => (a.tail ? 1 : 0) - (b.tail ? 1 : 0));
  return out;
}

const { server, publicServer, store } = createZeitServer({
  dataDir: DATA, port: PORT, publicPort: PUBLIC_PORT,
});

server.listen(PORT, () => {
  publicServer.listen(PUBLIC_PORT, () => {
    const ips = adressen();
    const loc = store.state.locations[0];
    const oeff = (store.state.config.oeffentlicheAdresse || "").trim();
    console.log("");
    console.log("  KINGSLEY ZEIT – Stempeluhr");
    console.log("  ===========================");
    console.log("  Daten: " + DATA);
    console.log("");
    console.log("  CHEF-BEREICH (privat, nur im Netz / über Tailscale):");
    console.log("     http://localhost:" + PORT + "/chef");
    for (const i of ips) {
      console.log("     http://" + i.ip + ":" + PORT + "/chef" + (i.tail ? "   <- Tailscale" : ""));
    }
    console.log("");
    console.log("  STEMPELN (öffentlicher Port " + PUBLIC_PORT + ", ohne Chef-Bereich):");
    for (const i of ips) {
      console.log("     http://" + i.ip + ":" + PUBLIC_PORT + "/");
    }
    if (oeff) console.log("     " + oeff + "/   <- im Dashboard hinterlegt");
    if (loc) {
      const basis = oeff || ("http://" + ((ips[0] && ips[0].ip) || "localhost") + ":" + PUBLIC_PORT);
      console.log("");
      console.log("  Standort \"" + loc.name + "\":");
      console.log("     iPad:      " + basis + "/terminal/" + loc.token);
      console.log("     Aufkleber: " + basis + "/s/" + loc.token);
    }
    if (!store.isSetupDone()) {
      console.log("");
      console.log("  >> Noch nicht eingerichtet: /chef öffnen und Chef-PIN festlegen.");
    }
    console.log("");
  });
});

process.on("uncaughtException", (e) => {
  console.error("[zeit] unerwarteter Fehler:", e && e.message);
});
