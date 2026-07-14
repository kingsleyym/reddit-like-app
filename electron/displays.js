"use strict";

// Windows-only: list the physical display OUTPUTS (GPU connectors) with their
// current desktop position. The device name (e.g. "\\.\DISPLAY1") is tied to
// the physical HDMI/DP port and stays stable across reboots, unlike the
// desktop X position, which Windows shuffles randomly for identical monitors
// after a cold boot. We use it to keep left/middle/right pinned to the ports.

const { execFile } = require("child_process");

const PS_SCRIPT = `
$sig = @'
using System;
using System.Runtime.InteropServices;
public class Disp {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra;
    public int dmFields; public int dmPositionX; public int dmPositionY;
    public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;
    public int dmDisplayFlags; public int dmDisplayFrequency;
    public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType;
    public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplayDevices(string d, uint i, ref DISPLAY_DEVICE dd, uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplaySettings(string d, int m, ref DEVMODE dm);
}
'@
Add-Type $sig
$res = @()
$i = 0
while ($true) {
  $d = New-Object Disp+DISPLAY_DEVICE
  $d.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($d)
  if (-not [Disp]::EnumDisplayDevices($null, $i, [ref] $d, 0)) { break }
  $i++
  if (($d.StateFlags -band 1) -eq 0) { continue }
  $m = New-Object Disp+DEVMODE
  $m.dmSize = [short][System.Runtime.InteropServices.Marshal]::SizeOf($m)
  if ([Disp]::EnumDisplaySettings($d.DeviceName, -1, [ref] $m)) {
    $res += [pscustomobject]@{ device = $d.DeviceName; x = $m.dmPositionX; y = $m.dmPositionY; width = $m.dmPelsWidth; height = $m.dmPelsHeight }
  }
}
ConvertTo-Json @($res) -Compress
`;

function listWindowsOutputs() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT],
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          const parsed = JSON.parse((stdout || "").trim() || "[]");
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (_) {
          resolve([]);
        }
      }
    );
  });
}

// Annotate each Electron display with the physical output device name by
// matching desktop position (accounting for display scaling). Returns
// [{ display, device }]. device is null when no confident match is found.
function matchDevices(displays, outputs) {
  return displays.map((d) => {
    const sf = d.scaleFactor || 1;
    const px = Math.round(d.bounds.x * sf);
    const py = Math.round(d.bounds.y * sf);
    let best = null;
    let bestDist = Infinity;
    for (const o of outputs) {
      const dScaled = Math.abs(o.x - px) + Math.abs(o.y - py);
      const dRaw = Math.abs(o.x - d.bounds.x) + Math.abs(o.y - d.bounds.y);
      const dist = Math.min(dScaled, dRaw);
      if (dist < bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    return { display: d, device: best && bestDist <= 8 ? best.device : null };
  });
}

module.exports = { listWindowsOutputs, matchDevices };
