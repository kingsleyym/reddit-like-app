"use strict";

// Allow inbound connections to the dashboard port through the Windows
// Firewall. Without this, only localhost works and a phone reaching the PC
// over Tailscale / the LAN is blocked. This is best-effort: it needs admin
// rights, which the NSIS installer has (the rule is also added there). On a
// non-elevated launch it simply fails silently and the installer's rule stays.

const { execFile } = require("child_process");

const RULE_NAME = "MenuBoard";

function netsh(args) {
  return new Promise((resolve) => {
    execFile("netsh", args, { windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, error: err ? (stderr || err.message || "").trim() : null });
    });
  });
}

async function ensureFirewallRule(port) {
  if (process.platform !== "win32") return { skipped: true };
  // Remove any existing rule of this name first to avoid duplicates, then add.
  await netsh(["advfirewall", "firewall", "delete", "rule", `name=${RULE_NAME}`]);
  return netsh([
    "advfirewall",
    "firewall",
    "add",
    "rule",
    `name=${RULE_NAME}`,
    "dir=in",
    "action=allow",
    "protocol=TCP",
    `localport=${port}`,
  ]);
}

module.exports = { ensureFirewallRule };
