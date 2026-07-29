"use strict";

// Windows power management: nightly sleep + automatic morning wake.
//
// Strategy (chosen with the user): the PC goes to *sleep* at night
// (~1-2 W) instead of a full shutdown, because Windows can wake itself
// from sleep on a schedule without any BIOS configuration. We register
// two scheduled tasks via PowerShell:
//   - "MenuBoard Wake"  : daily at wakeTime, with -WakeToRun, wakes the PC
//   - "MenuBoard Sleep" : daily at sleepTime, puts the PC to sleep
//
// All of this is a no-op on non-Windows platforms (e.g. the build/CI box).

const { execFile } = require("child_process");

function isWindows() {
  return process.platform === "win32";
}

function runPowershell(script) {
  return new Promise((resolve, reject) => {
    if (!isWindows()) {
      return resolve({ skipped: true, reason: "not windows" });
    }
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error((stderr || err.message || "").trim()));
        }
        resolve({ stdout: (stdout || "").trim() });
      }
    );
  });
}

function parseHHMM(value, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return fallback;
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Apply (or remove) the nightly power schedule.
 */
async function applySchedule(schedule) {
  if (!isWindows()) {
    return { applied: false, skipped: true, reason: "not windows" };
  }

  const sleepTime = parseHHMM(schedule.sleepTime, "23:30");
  const wakeTime = parseHHMM(schedule.wakeTime, "08:30");

  // Always remove old tasks first so changes take effect cleanly.
  const removeScript = `
    schtasks /Delete /TN "MenuBoard Wake" /F 2>$null;
    schtasks /Delete /TN "MenuBoard Sleep" /F 2>$null;
  `;

  if (!schedule.enabled) {
    try {
      await runPowershell(removeScript);
      return { applied: true, enabled: false };
    } catch (err) {
      return { applied: false, error: err.message };
    }
  }

  // Make sure sleep (S3) is used rather than hibernate, and that wake
  // timers are allowed. These commands need admin; failures are ignored
  // so the tasks still get registered where possible.
  const prep = `
    powercfg /hibernate off 2>$null;
    powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 2>$null;
    powercfg /SETACTIVE SCHEME_CURRENT 2>$null;
  `;

  const sleepCmd = "rundll32.exe powrprof.dll,SetSuspendState 0,1,0";

  // Register tasks via PowerShell's ScheduledTasks module so we can set
  // -WakeToRun on the wake task.
  const register = `
    $wakeAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c exit";
    $wakeTrigger = New-ScheduledTaskTrigger -Daily -At ${wakeTime};
    $wakeSettings = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;
    Register-ScheduledTask -TaskName "MenuBoard Wake" -Action $wakeAction -Trigger $wakeTrigger -Settings $wakeSettings -RunLevel Highest -Force -User "SYSTEM" | Out-Null;

    $sleepAction = New-ScheduledTaskAction -Execute "rundll32.exe" -Argument "powrprof.dll,SetSuspendState 0,1,0";
    $sleepTrigger = New-ScheduledTaskTrigger -Daily -At ${sleepTime};
    $sleepSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;
    Register-ScheduledTask -TaskName "MenuBoard Sleep" -Action $sleepAction -Trigger $sleepTrigger -Settings $sleepSettings -RunLevel Highest -Force -User "SYSTEM" | Out-Null;
    Write-Output "ok";
  `;

  try {
    await runPowershell(prep);
    const res = await runPowershell(register);
    return { applied: true, enabled: true, sleepTime, wakeTime, output: res.stdout };
  } catch (err) {
    return {
      applied: false,
      error: err.message,
      hint: "Zeitplan benoetigt Administratorrechte. App als Administrator starten.",
    };
  }
}

/**
 * Run an immediate power/maintenance action from the dashboard.
 */
async function runPowerAction(action, helpers) {
  switch (action) {
    case "sleep":
      return runPowershell("rundll32.exe powrprof.dll,SetSuspendState 0,1,0");
    case "restart-players":
      if (helpers && helpers.recreateAllPlayers) helpers.recreateAllPlayers();
      return { ok: true };
    case "restart-app": {
      // App komplett neu starten. Beim Start prueft der Updater sofort auf
      // neue Releases; liegt schon eines bereit, installiert es sich beim
      // Beenden (autoInstallOnAppQuit). Damit laesst sich ein Update aus
      // der Ferne anstossen - ohne AnyDesk, ohne RDP.
      const { app } = require("electron");
      setTimeout(() => { app.relaunch(); app.quit(); }, 800);
      return { ok: true, note: "App startet neu" };
    }
    case "reboot-pc": {
      // Windows-Neustart mit 10s Vorlauf. Autologin + Autostart bringen
      // danach alles von allein wieder hoch.
      return new Promise((resolve) => {
        execFile("shutdown", ["/r", "/t", "10"], { windowsHide: true }, () =>
          resolve({ ok: true, note: "PC startet in 10 Sekunden neu" }));
      });
    }
    default:
      throw new Error("unbekannte Aktion: " + action);
  }
}

module.exports = { applySchedule, runPowerAction };
