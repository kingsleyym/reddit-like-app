"use strict";

/*
 * Kingsley Zeit – Mitteilungen aufs Handy (Web Push)
 * ==================================================
 * Ohne fremden Dienst, ohne Konto, ohne Kosten und ohne "npm install".
 *
 * Wie das funktioniert, in einem Absatz:
 * Der Browser des Mitarbeiters meldet sich SELBST beim Push-Dienst seines
 * Herstellers an (Google bei Android/Chrome, Apple bei iPhone) und gibt uns
 * eine Adresse plus zwei Schluessel zurueck. Wir verschluesseln die Nachricht
 * so, dass NUR dieses eine Geraet sie lesen kann - der Push-Dienst sieht nur
 * Buchstabensalat - und legen sie dort ab. Der Dienst stellt zu.
 *
 * Umgesetzt sind damit zwei Normen, beide mit Bordmitteln von Node:
 *   RFC 8291  Verschluesselung des Inhalts (ECDH P-256, HKDF, AES-128-GCM)
 *   RFC 8292  VAPID: wir unterschreiben mit unserem eigenen Schluesselpaar,
 *             damit der Push-Dienst weiss, dass die Nachricht von uns kommt
 *
 * WICHTIG fuers iPhone: Mitteilungen kommen dort nur an, wenn die Seite
 * vorher ueber "Teilen -> Zum Home-Bildschirm" abgelegt wurde (ab iOS 16.4).
 * Auf Android geht es sofort. Beides braucht HTTPS - der Tailscale-Funnel
 * liefert das.
 */

const crypto = require("crypto");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");

/* ------------------------- Schluesselpaar (VAPID) ------------------------ */

function neuesSchluesselpaar() {
  const ec = crypto.createECDH("prime256v1");
  ec.generateKeys();
  // Der private Schluessel kann fuehrende Nullbytes verlieren - auffuellen,
  // sonst schlaegt der Import als JWK spaeter fehl.
  const priv = Buffer.alloc(32);
  const roh = ec.getPrivateKey();
  roh.copy(priv, 32 - roh.length);
  return { pub: b64u(ec.getPublicKey()), priv: b64u(priv) };
}

function privateKeyObj(paar) {
  const pub = unb64u(paar.pub);
  return crypto.createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC", crv: "P-256",
      x: b64u(pub.slice(1, 33)),
      y: b64u(pub.slice(33, 65)),
      d: paar.priv,
    },
  });
}

// Der Ausweis, den der Push-Dienst sehen will: ein kurzlebiges, signiertes
// Token fuer genau diesen Push-Dienst.
function vapidKopf(paar, endpoint, kontakt) {
  const u = new URL(endpoint);
  const kopf = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const rumpf = b64u(JSON.stringify({
    aud: u.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: kontakt || "mailto:chef@kingsley-zeit.local",
  }));
  const daten = Buffer.from(kopf + "." + rumpf);
  const sig = crypto.sign("sha256", daten,
    { key: privateKeyObj(paar), dsaEncoding: "ieee-p1363" });
  return "vapid t=" + kopf + "." + rumpf + "." + b64u(sig) + ", k=" + paar.pub;
}

/* ------------------------ Inhalt verschluesseln -------------------------- */

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
// HKDF in der kurzen Form, die Web Push braucht (Ausgabe immer <= 32 Byte).
const hkdf = (salt, ikm, info, laenge) =>
  hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).slice(0, laenge);

// fest = { asPriv, salt } nur fuer die Pruefung gegen die Beispielwerte aus
// RFC 8291. Im Betrieb wird beides immer frisch gewuerfelt.
function verschluesseln(text, uaPubB64, authB64, fest) {
  const uaPub = unb64u(uaPubB64);          // 65 Byte, Geraeteschluessel
  const auth = unb64u(authB64);            // 16 Byte, gemeinsames Geheimnis

  const ec = crypto.createECDH("prime256v1");
  if (fest && fest.asPriv) ec.setPrivateKey(unb64u(fest.asPriv));
  else ec.generateKeys();
  const asPub = ec.getPublicKey();
  const gemeinsam = ec.computeSecret(uaPub);
  const salt = fest && fest.salt ? unb64u(fest.salt) : crypto.randomBytes(16);

  // Aus dem gemeinsamen Geheimnis wird zuerst das Ausgangsmaterial ...
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"), uaPub, asPub,
  ]);
  const ikm = hkdf(auth, gemeinsam, keyInfo, 32);
  // ... und daraus Schluessel und Nonce fuer AES-128-GCM.
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const klartext = Buffer.concat([Buffer.from(text, "utf8"), Buffer.from([2])]);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const geheim = Buffer.concat([c.update(klartext), c.final(), c.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, geheim]);
}

/* ----------------------------- Verschicken ------------------------------- */

function senden(paar, abo, text, { ttl = 3600, dringend = true, kontakt } = {}) {
  return new Promise((fertig) => {
    let u;
    try { u = new URL(abo.endpoint); } catch (_) { return fertig({ ok: false, weg: true }); }
    let koerper;
    try {
      koerper = verschluesseln(text, abo.keys.p256dh, abo.keys.auth);
    } catch (e) {
      return fertig({ ok: false, fehler: "verschluesseln: " + e.message });
    }
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request({
      method: "POST",
      hostname: u.hostname,
      port: u.port || (u.protocol === "http:" ? 80 : 443),
      path: u.pathname + u.search,
      headers: {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Content-Length": koerper.length,
        TTL: String(ttl),
        Urgency: dringend ? "high" : "normal",
        Authorization: vapidKopf(paar, abo.endpoint, kontakt),
      },
      timeout: 12000,
    }, (res) => {
      let s = "";
      res.on("data", (d) => { s += d; });
      res.on("end", () => {
        // 404/410 = das Geraet gibt es nicht mehr. Abo darf weg.
        const weg = res.statusCode === 404 || res.statusCode === 410;
        fertig({ ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode, weg, text: s.slice(0, 200) });
      });
    });
    req.on("timeout", () => { req.destroy(); fertig({ ok: false, fehler: "Zeitüberschreitung" }); });
    req.on("error", (e) => fertig({ ok: false, fehler: e.message }));
    req.end(koerper);
  });
}

module.exports = { neuesSchluesselpaar, senden, verschluesseln, vapidKopf, b64u, unb64u };
