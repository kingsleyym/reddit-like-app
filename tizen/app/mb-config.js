/* MenuBoard – Build-Konfiguration.
 *
 * Diese Datei wird vom Build-Skript (tizen/build.js) überschrieben.
 * Beim Bauen entweder --server angeben oder hier den Standard ändern.
 *
 *   server            Basis-Adresse des MenuBoard-Servers (ohne Schrägstrich am Ende)
 *   screen            Notfall-Voreinstellung, falls der Server nicht antwortet
 *                     und die Install-URL keine Nummer enthält
 *   pollMs            Intervall für Heartbeat/Watchdog in Millisekunden
 *   dailyReloadHour   Stunde für den nächtlichen Neustart (0–23), -1 = aus
 */
window.MB_CONFIG = {
  server: "http://192.168.1.50:8787",
  screen: "1",
  buildVersion: "0.0.0-dev",
  pollMs: 15000,
  dailyReloadHour: 4
};
