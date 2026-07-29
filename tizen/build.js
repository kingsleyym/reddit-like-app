#!/usr/bin/env node
"use strict";

/**
 * MenuBoard – Build- und Signier-Skript für das Samsung-Tizen-Widget.
 *
 * Erzeugt aus tizen/app/ ein signiertes .wgt-Paket und legt es dort ab, wo der
 * MenuBoard-Server es über /tizen/<N>/ ausliefern kann.
 *
 * Beispiele:
 *   node tizen/build.js --server http://192.168.1.50:8787 --profile MenuBoard
 *   node tizen/build.js --server http://192.168.1.50:8787 --profile MenuBoard --per-screen 4
 *   node tizen/build.js --server http://192.168.1.50:8787 --profile MenuBoard --no-deploy
 *
 * Optionen:
 *   --server <url>      Adresse des MenuBoard-Servers (Pflicht beim ersten Bauen)
 *   --profile <name>    Name des Tizen-Security-Profils (Standard: MenuBoard)
 *   --version <x.y.z>   Widget-Version (Standard: version aus package.json)
 *   --per-screen [n]    Baut n einzelne Pakete MenuBoard1..n statt eines
 *                       universellen Pakets (nur nötig, wenn die automatische
 *                       Zuweisung über den Server nicht genutzt werden soll)
 *   --name <Name>       Basisname des Pakets (Standard: MenuBoard)
 *   --partner           Fügt Partner-Level-Privilegien hinzu (nur mit
 *                       Samsung-Partner-Zertifikat sinnvoll)
 *   --out <dir>         Ausgabeordner (Standard: tizen/dist)
 *   --deploy <dir>      Zielordner für den Server (Standard: MenuBoard-Datenordner)
 *   --no-deploy         Nicht in den Datenordner kopieren
 *   --tizen <pfad>      Pfad zur tizen-CLI, falls nicht in PATH
 *   --skip-package      Nur vorbereiten, nicht bauen/signieren (zum Prüfen)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const APP_DIR = path.join(ROOT, "app");
const WORK_DIR = path.join(ROOT, "build");

/* ------------------------------------------------------------ Argumente */

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function fail(msg) {
  console.error("\n  FEHLER: " + msg + "\n");
  process.exit(1);
}

/* ------------------------------------------------------------ Grundwerte */

let pkgVersion = "1.0.0";
try { pkgVersion = require(path.join(ROOT, "..", "package.json")).version || pkgVersion; } catch (_) {}

const NAME = String(args.name || "MenuBoard").replace(/[^0-9A-Za-z]/g, "") || "MenuBoard";
const PROFILE = args.profile === true ? null : (args.profile || "MenuBoard");
const OUT_DIR = args.out && args.out !== true ? path.resolve(String(args.out)) : path.join(ROOT, "dist");
const SKIP_PACKAGE = !!args["skip-package"];

// Widget-Version muss {0-255}.{0-255}.{0-65535} entsprechen.
const rawVersion = args.version && args.version !== true ? String(args.version) : pkgVersion;
const vm = /^(\d+)\.(\d+)\.(\d+)/.exec(rawVersion);
if (!vm) fail("Ungültige Version: " + rawVersion + " (erwartet x.y.z)");
const VERSION = [Math.min(255, +vm[1]), Math.min(255, +vm[2]), Math.min(65535, +vm[3])].join(".");

const perScreenRaw = args["per-screen"];
const PER_SCREEN = perScreenRaw ? (perScreenRaw === true ? 4 : Math.max(1, Math.min(12, parseInt(perScreenRaw, 10) || 4))) : 0;

/* ------------------------------------------------- Server-Adresse merken */

const SETTINGS_FILE = path.join(ROOT, ".build-settings.json");
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch (_) {}

let server = args.server && args.server !== true ? String(args.server) : settings.server;
if (!server) {
  fail(
    "Keine Server-Adresse angegeben.\n" +
    "  Beispiel: node tizen/build.js --server http://192.168.1.50:8787 --profile MenuBoard\n" +
    "  (Die IP ist die des PCs, auf dem standalone.js läuft.)"
  );
}
if (!/^https?:\/\//i.test(server)) server = "http://" + server;
server = server.replace(/\/+$/, "");
if (!/:\d+$/.test(server)) server += ":8787";

settings.server = server;
try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (_) {}

/* -------------------------------------------------------- Datenverzeichnis */

function dataDir() {
  if (process.env.MENUBOARD_DATA) return process.env.MENUBOARD_DATA;
  if (process.platform === "win32") return path.join(process.env.ProgramData || "C:\\ProgramData", "MenuBoard");
  return path.join(os.homedir(), ".menuboard");
}

let deployDir = null;
if (!args["no-deploy"]) {
  deployDir = args.deploy && args.deploy !== true
    ? path.resolve(String(args.deploy))
    : path.join(dataDir(), "tizen");
}

/* ----------------------------------------------------------- tizen-CLI */

function findTizenCli() {
  if (args.tizen && args.tizen !== true) return String(args.tizen);
  if (process.env.TIZEN_CLI) return process.env.TIZEN_CLI;

  const exe = process.platform === "win32" ? "tizen.bat" : "tizen";
  const candidates = [
    path.join(os.homedir(), "tizen-studio", "tools", "ide", "bin", exe),
    path.join(os.homedir(), "TizenStudio", "tools", "ide", "bin", exe),
    "/opt/tizen-studio/tools/ide/bin/" + exe,
    "C:\\tizen-studio\\tools\\ide\\bin\\" + exe,
    "C:\\Program Files\\tizen-studio\\tools\\ide\\bin\\" + exe,
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return exe; // Hoffnung: liegt im PATH
}

const TIZEN = findTizenCli();

function run(cmd, cmdArgs, cwd) {
  console.log("  > " + cmd + " " + cmdArgs.join(" "));
  return execFileSync(cmd, cmdArgs, {
    cwd: cwd || ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

/* ------------------------------------------------------------- Hilfsmittel */

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const PARTNER_PRIVILEGES = [
  '<tizen:privilege name="http://developer.samsung.com/privilege/b2bcontrol"/>',
  '<tizen:privilege name="http://developer.samsung.com/privilege/systemcontrol"/>',
].join("\n  ");

function patchConfig(dir, version) {
  const file = path.join(dir, "config.xml");
  let xml = fs.readFileSync(file, "utf8");

  xml = xml.replace(/(<widget\b[\s\S]*?\sversion=")[^"]*(")/, "$1" + version + "$2");
  xml = xml.replace(/<!--\s*MB:PRIVILEGES\s*-->/, args.partner ? PARTNER_PRIVILEGES : "");

  fs.writeFileSync(file, xml);
}

function writeRuntimeConfig(dir, screen, version) {
  const cfg = {
    server: server,
    screen: String(screen),
    buildVersion: version,
    pollMs: 15000,
    dailyReloadHour: 4,
    // Nativer AVPlay-Player. Standard: aus. Mit  --native  einschalten,
    // um eine Testfassung zu bauen.
    nativePlayer: !!args.native,
  };
  fs.writeFileSync(
    path.join(dir, "mb-config.js"),
    "/* Automatisch erzeugt von tizen/build.js – nicht von Hand ändern. */\n" +
    "window.MB_CONFIG = " + JSON.stringify(cfg, null, 2) + ";\n"
  );
}

function packageOne(label, screen, outName) {
  const dir = path.join(WORK_DIR, label);
  rmrf(dir);
  copyDir(APP_DIR, dir);
  patchConfig(dir, VERSION);
  writeRuntimeConfig(dir, screen, VERSION);

  if (SKIP_PACKAGE) {
    console.log("  (--skip-package) vorbereitet in " + dir);
    return null;
  }

  run(TIZEN, ["build-web", "--", dir]);

  const buildResult = path.join(dir, ".buildResult");
  if (!fs.existsSync(buildResult)) fail("tizen build-web hat keinen .buildResult-Ordner erzeugt: " + buildResult);

  const packageArgs = ["package", "-t", "wgt"];
  if (PROFILE) packageArgs.push("-s", PROFILE);
  packageArgs.push("--", buildResult);
  run(TIZEN, packageArgs, ROOT);

  const produced = fs.readdirSync(buildResult).filter((f) => f.toLowerCase().endsWith(".wgt"));
  if (!produced.length) fail("Kein .wgt in " + buildResult + " gefunden – hat das Signieren geklappt?");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const target = path.join(OUT_DIR, outName + ".wgt");
  fs.copyFileSync(path.join(buildResult, produced[0]), target);
  return target;
}

/* -------------------------------------------------------------------- Lauf */

console.log("");
console.log("  MenuBoard – Tizen-Widget bauen");
console.log("  ------------------------------");
console.log("  Server        : " + server);
console.log("  Version       : " + VERSION);
console.log("  Profil        : " + (PROFILE || "(Standardprofil der tizen-CLI)"));
console.log("  tizen-CLI     : " + TIZEN);
console.log("  Modus         : " + (PER_SCREEN ? PER_SCREEN + " Einzelpakete" : "ein universelles Paket"));
console.log("  Ausgabe       : " + OUT_DIR);
console.log("  Deploy        : " + (deployDir || "(aus)"));
console.log("");

rmrf(WORK_DIR);
fs.mkdirSync(WORK_DIR, { recursive: true });
rmrf(OUT_DIR);

const built = [];
if (PER_SCREEN) {
  for (let n = 1; n <= PER_SCREEN; n++) {
    console.log("  [Bildschirm " + n + "]");
    const t = packageOne("screen" + n, n, NAME + n);
    if (t) built.push(t);
  }
} else {
  console.log("  [universelles Paket]");
  const t = packageOne("universal", 1, NAME);
  if (t) built.push(t);
}

if (!built.length) { console.log("\n  Nichts gebaut (--skip-package).\n"); process.exit(0); }

/* --------------------------------------------------------------- Manifest */

const manifest = {
  name: NAME,
  version: VERSION,
  server: server,
  builtAt: new Date().toISOString(),
  perScreen: PER_SCREEN || 0,
  files: built.map((f) => ({ file: path.basename(f), size: fs.statSync(f).size })),
};
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

/* ---------------------------------------------------------------- Deploy */

if (deployDir) {
  fs.mkdirSync(deployDir, { recursive: true });
  for (const f of fs.readdirSync(deployDir)) {
    if (f.toLowerCase().endsWith(".wgt")) { try { fs.unlinkSync(path.join(deployDir, f)); } catch (_) {} }
  }
  for (const f of built) fs.copyFileSync(f, path.join(deployDir, path.basename(f)));
  fs.copyFileSync(path.join(OUT_DIR, "manifest.json"), path.join(deployDir, "manifest.json"));
}

console.log("");
console.log("  Fertig.");
for (const f of built) console.log("    " + f + "  (" + fs.statSync(f).size + " Bytes)");
if (deployDir) console.log("  Kopiert nach: " + deployDir);
console.log("");
console.log("  Install-URLs für die Displays (Custom App):");
const count = PER_SCREEN || 4;
for (let n = 1; n <= count; n++) console.log("    Display " + n + ":  " + server + "/tizen/" + n);
console.log("");
