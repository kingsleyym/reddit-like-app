# Kingsley Zeit — Stempeluhr

Zeiterfassung für kleine Teams. Läuft auf dem Laden-PC, ohne Cloud, ohne Konten,
ohne fremde Bibliotheken (blankes Node genügt).

## Der Kerngedanke

**Regelfall: das iPad im Laden.** Es hängt dauerhaft im Personalbereich und
zeigt die Mitarbeiter als große Foto-Kacheln. Jeder tippt sein eigenes Bild
an — fertig. Grüne Kachel = im Laden, orange = heute eingeteilt, rote =
Schicht läuft, aber noch nicht gestempelt. Mehrere Leute nacheinander am
selben Gerät, ohne An- und Abmelden.

**Nur der heutige Tag zählt.** Das iPad zeigt nur, wer heute Bezug zum Laden
hat: eingestempelt, eingeteilt oder überfällig. Alle übrigen (bei 50 Leuten
wären das 47 graue Kacheln) stecken hinter *„+ N weitere anzeigen"* — und wer
spontan einspringt, klappt entweder auf oder nimmt gleich **Code eingeben**.

**Notfall: der persönliche Code.** Jeder hat einen eigenen Code aus 2 Buchstaben
und 4 Ziffern (z. B. `AY1234` für Ahmet Yilmaz). Damit funktioniert dieselbe
Stempeluhr an *jedem* Gerät — am eigenen Handy über mobile Daten, am PC an der
Kasse, egal wo. **Handy vergessen, Akku leer, iPad belegt: kein Problem.**

Der Code ist bewusst so gebaut, dass du als Chef auf einen Blick siehst, wem er
gehört — im Team-Bereich steht bei jedem `AY••••`.

Es gibt keinen Login, kein Passwort, keine App.

## Anwesenheit: der NFC-Aufkleber

### Ein Ablauf für alle Geräte

Am Eingang klebt ein NFC-Aufkleber. Handy dranhalten → es öffnet sich **genau
dieselbe Kachel-Ansicht wie auf dem iPad**: alle Mitarbeiter mit Foto, grün =
im Laden, grau = nicht da. Eigene Kachel antippen → einmalig den persönlichen
Code eingeben → gestempelt.

**Der Code wird gemerkt — aber nur am privaten Handy.** Ab dem zweiten Mal
genügt: Handy an den Aufkleber, eigene Kachel antippen, bestätigen. Kein Tippen
mehr. „Ich bin das nicht" löscht die Speicherung wieder.

### Warum das iPad niemals etwas merkt

Das iPad ist ein **geteiltes** Gerät. Würde es sich einen Code merken, hätte es
den des zuletzt Tippenden gespeichert und für alle anderen weiterverwendet —
ein Mitarbeiter könnte damit für einen Kollegen stempeln. Deshalb:

- Ob gemerkt werden darf, entscheidet **nicht die Adresse, sondern die Rolle,
  die der Server vergibt** (Terminal- oder Handy-Sitzung im Cookie). Getrennte
  Links wären unsicherer: die könnte man verwechseln oder weitergeben, die
  Rolle im Cookie nicht.
- Wird ein Gerät nachträglich zum Terminal gemacht, fliegt ein eventuell früher
  gemerkter Code beim ersten Laden automatisch raus.
- Am iPad ist der Code standardmäßig gar nicht nötig (es hängt ja fest im
  Laden). Schaltest du ihn ein, wird er **jedes Mal neu** verlangt, und der Code
  einer anderen Person wird abgewiesen.

Damit bleibt das iPad ein verlässliches Backup: Handy vergessen, Akku leer,
Sticker abgefallen — hingehen, Kachel antippen, fertig.

### Fester Aufkleber, wechselnder Link — vollautomatisch

Auf dem Sticker steht eine feste Adresse (`…/s/<STANDORT-CODE>`) — anders geht
es mit einfachen NFC-Stickern nicht, der Chip kann seinen Inhalt nicht ändern.

Der Server macht daraus aber bei **jedem** Antippen einen frischen, kurzlebigen
Link (`/t/QA152ESrQwTS` → beim nächsten Mal `/t/fHKQ-ekK93Bl`). Das läuft
komplett von allein, du musst nichts einstellen und nichts erneuern:

- Der Link im Browser ist jedes Mal ein anderer und verfällt nach wenigen
  Minuten — man kann ihn nicht aufheben und morgen wiederverwenden.
- Er wird an das erste Gerät gebunden, das ihn öffnet. Einem Kollegen
  weiterschicken bringt nichts (getestet).

**Ehrlich zur Grenze:** Wer sich die *feste* Aufkleber-Adresse notiert, könnte
sie theoretisch von zu Hause öffnen. Dagegen helfen zwei Dinge, die du im
Dashboard einschaltest: die **Öffnungszeiten** (außerhalb wird gar nicht
gestempelt) und der **persönliche Code**, der beim Handy immer verlangt wird.
Wer es ganz dicht will, verteilt keine Aufkleber — dann geht Stempeln nur am
iPad im Laden.

## Öffnungszeiten

Im Dashboard einstellbar: Von–Bis plus Puffer davor und danach (für
Vorbereitung und Aufräumen). Außerhalb wird das Stempeln abgelehnt und das
iPad zeigt unten „Geschlossen". Zeiten über Mitternacht (z. B. 11:00–02:00)
werden richtig erkannt.

## Zwei Ports — warum das wichtig ist

| Port | Was | Erreichbar von |
|---|---|---|
| **8792** privat | alles, **inklusive Chef-Bereich** | Laden-Netzwerk und Tailscale |
| **8794** öffentlich | **nur Stempeln** | ins Internet (Tailscale-Funnel auf 8443) |

Der Chef-Bereich existiert auf dem öffentlichen Port **standardmäßig gar
nicht** — er ist also nicht bloß „passwortgeschützt", sondern nicht vorhanden
(geprüft: liefert 404, auch der Login-Aufruf). Ein Admin-Bereich mit
vierstelliger PIN gehört nicht ins offene Internet.

## Chef von unterwegs

Zwei Wege, je nachdem wie viel Aufwand vertretbar ist:

**Weg A — Tailscale (am sichersten, nichts einzustellen).**
Tailscale auf dem Handy einschalten, dann `http://100.114.126.37:8792/chef`.
Der Chef-Bereich ist dabei nie im offenen Internet.

**Weg B — ohne Tailscale, über das Internet.**
Einzuschalten unter *Einstellungen → Chef von unterwegs*. Danach gilt:

| Schloss | Was es leistet |
|---|---|
| **Geheime Adresse** `…/f/<22 Zeichen>` | Wer sie nicht hat, bekommt „Nicht gefunden“. Für Scanner und Bots existiert der Chef-Bereich nicht. Einmal pro Gerät öffnen, danach Lesezeichen. |
| **Langes Passwort** | Mindestens 10 Zeichen, nicht nur Ziffern. Wird mit scrypt (N=32768) gespeichert — jeder Rateversuch kostet spürbar Rechenzeit. |

Dazu kommt:

* Die **4-stellige Chef-PIN gilt draußen nie**. Sie ist ausdrücklich nur für
  den Weg über Tailscale bzw. den Laden.
* Eine Anmeldung mit der PIN erzeugt **keine** Sitzung, die draußen gilt —
  und umgekehrt.
* Nach **5 Fehlversuchen** wird die Gegenstelle gesperrt, die Sperrzeit
  verdoppelt sich (1, 2, 4 … bis 60 Minuten). Auch das richtige Passwort
  prallt während der Sperre ab.
* Von unterwegs endet die Sitzung nach **3 Stunden** (im Laden nach 12).
* Ein- und Ausschalten, neues Passwort und neue geheime Adresse gehen
  **nur vom Laden/Tailscale aus**. Wer sich von unterwegs anmeldet, kann sich
  also keinen dauerhaften Zweitzugang bauen.
* **Handy verloren?** *Neue geheime Adresse* im Chef-Bereich. Alle bisherigen
  Geräte sind sofort ausgesperrt, das Passwort bleibt gleich.
* Der Chef-Bereich schickt an den Browser **nur** das, was die Oberfläche
  braucht. Der HMAC-Schlüssel des Servers und die Passwort-Hashes verlassen
  den Server nie.

Ehrlich dazugesagt: Weg B ist deutlich stärker als ein einfaches Login, aber
Weg A bleibt sicherer, weil dort gar nichts im offenen Internet steht. Weg B
ist für die Fälle gedacht, in denen Tailscale nicht auf dem Gerät ist.

## Chef-Bereich (`/chef`)

| Bereich | Was du dort tust |
|---|---|
| **Jetzt** | Wer ist gerade im Laden, seit wann, laufende Stunden |
| **Zeiten** | Zeitraum wählen → **eine Zeile je Mitarbeiter**. Details erst auf Klick |
| **Zu prüfen** | Arbeitsliste aller Unstimmigkeiten — hier passiert das Korrigieren |
| **Schichtplan** | Wochenplan, Schichtarten, Serien, offene Schichten, Meldungen, Soll gegen Ist |
| **Team** | Mitarbeiter anlegen, Code vergeben, Foto, Standort, aktiv/inaktiv |
| **Einstellungen** | Firma, Öffnungszeiten, Pausen, Auto-Ausstempeln, Standorte, Mitteilungen, Chef-PIN, Protokoll |

### Aussehen

Eine Oberfläche, zwei Farbwelten: **Hell und Dunkel**. Standard ist die
Einstellung des Geräts; der Sonne/Mond-Knopf (Seitenleiste bzw. Kopfzeile,
auch am iPad-Terminal) schaltet um und merkt sich die Wahl im Browser.

Die Schrift (Inter) liefert der Server selbst aus (`zeit/schrift.woff2`) —
kein fremder Dienst, funktioniert ohne Internet. Fehlt die Datei, springt
die Systemschrift ein.

Am grossen Bildschirm gibt es eine feste Seitenleiste links, am Handy eine
App-Leiste unten — dieselben Reiter, derselbe Inhalt.

### Entwickler-Bereich (in den Einstellungen)

Der Laden-Chef soll Mitarbeiter anlegen und Zeiten prüfen — nicht mit
Weblinks und NFC-Technik hantieren. Deshalb liegt alles Technische hinter
*Einstellungen → Entwickler-Einstellungen* und einer eigenen PIN
(**Standard: 1337**, im Bereich änderbar):

- Öffentliche Adresse (Tailscale-Funnel)
- iPad- und Aufkleber-Adressen je Standort, QR-Codes, Sticker-Code neu
- Chef von unterwegs (Fernzugang)
- Angemeldete Push-Geräte
- Entwickler-PIN ändern

Das ist ausdrücklich **kein Sicherheits-, sondern ein Ordnungsding**: Die
PIN hält den Bereich aus dem Alltag heraus, damit nichts aus Versehen
verstellt wird. Die echte Sicherheit (Zwei-Port-Trennung, Fernzugang mit
geheimer Adresse + langem Passwort) bleibt davon unberührt. Standorte
anlegen und umbenennen kann der Chef weiterhin selbst.

### Gebaut für ein volles Jahr

Die Zeiten-Ansicht zeigt **immer zuerst eine Zusammenfassung**: pro Mitarbeiter
eine Zeile mit Gesamtstunden, Anzahl Schichten und Tagen. Erst wenn du jemanden
antippst, werden dessen Schichten nachgeladen — nach Kalenderwochen gruppiert,
neueste zuerst. Dadurch bleibt die Seite gleich schnell, ob 10 oder 10.000
Stempel im System sind (getestet mit 1.000 Schichten: unter 300 ms).

Zeitraum-Schnellwahl: Diese Woche · Letzte Woche · Dieser Monat · Letzte 30 Tage
· freier Zeitraum. Dazu Filter nach Standort.

### „Zu prüfen" — die Arbeitsliste

Statt Probleme in einer langen Liste zu suchen, sammelt dieser Reiter alles,
was nicht sauber gestempelt wurde. Die Zahl im Reiter zeigt, wie viel offen ist:

| Markierung | Bedeutung |
|---|---|
| **LÄUFT** | noch eingestempelt (Ausstempeln fehlt bisher) |
| **START FEHLT** | es gibt ein Ausstempeln ohne passendes Einstempeln |
| **AUTOMATISCH** | das System hat automatisch ausgestempelt — bitte bestätigen |
| **SEHR LANG** | Schicht länger als eingestellt (Standard 14 h) |

Jeder Eintrag hat „Korrigieren" (Zeiten ändern oder nachtragen) und bei
automatischen Einträgen „Passt so" (als geprüft abhaken). Erledigtes
verschwindet von selbst aus der Liste.

## Schichtplan

Eine Oberfläche, zwei Bedienarten — dasselbe darunter.

**Am Rechner: ziehen.** Ein Wochenraster, links die Leute, oben die Tage.
Oben in der Leiste stehen deine **Schichtarten** (Früh, Spät, Wochenende …)
mit Farbe und Zeiten. Eine Schichtart in eine Zelle ziehen → Schicht ist
angelegt. Eine bestehende Schicht auf einen anderen Tag oder eine andere
Person ziehen → verschoben. In die Zeile **Unbesetzt** ziehen → die Schicht
ist frei und wird allen angeboten.

**Am Handy: tippen.** Statt des Rasters kommt Tag für Tag eine Liste. Alles
mit dem Daumen erreichbar, kein Zoomen, kein Ziehen nötig. (Wer will, kann
auch am Handy ziehen — lange antippen, dann hängt die Schicht am Finger.)

Das Ziehen ist selbst gebaut statt mit dem Browser-Standard, weil der auf
Touchgeräten nicht zuverlässig funktioniert. Ein Zug beginnt erst nach ein
paar Pixeln Bewegung — ein Klick bleibt also ein Klick.

### Wiederkehrende Schichten

Beim Anlegen einer Schicht *Jede Woche wiederholen* einschalten und die
Wochentage antippen. Wichtig dabei: Serien legen **echte Schichten** an,
sie werden nicht jedes Mal neu ausgerechnet. Das heißt:

* Eine einzelne Woche lässt sich verschieben oder kürzen, **ohne dass die
  Serie kaputtgeht**. Von Hand Geändertes wird nie überschrieben.
* Der Plan läuft im Hintergrund automatisch ein paar Wochen voraus
  (einstellbar, Standard 4 Wochen).
* *Ganze Serie ab heute löschen* räumt nur die Zukunft ab — was war, bleibt
  als Beleg stehen.

### Veröffentlichen

Was du planst, ist zuerst **nur für dich sichtbar** (im Raster mit „neu"
markiert). Erst *Veröffentlichen* macht die Woche für die Mitarbeiter
sichtbar — und schickt genau den Betroffenen eine Mitteilung aufs Handy.
So kannst du in Ruhe herumschieben, ohne dass zehn Leute zehn Mitteilungen
bekommen.

### Was Mitarbeiter können

Am eigenen Handy oder am iPad im Laden: **Mein Plan** → Code eingeben. Am
eigenen Handy ist der Code gemerkt, dort ist es ein einziger Tipp; **am iPad
wird nie etwas gemerkt.**

**Von zu Hause:** Die Adresse `/mein` (öffentlicher Port) zeigt den eigenen
Plan von überall — nur mit dem persönlichen Code, ohne NFC-Tipp. Dort laufen
auch die Mitteilungen zusammen: Wer zu Hause auf „Neuer Schichtplan" tippt,
landet direkt in seinem Plan. Krankmelden, Tauschen und offene Schichten
übernehmen geht dort genauso. **Stempeln geht dort ausdrücklich nicht** —
das verlangt weiterhin die Anwesenheit im Laden (Aufkleber oder iPad). Das
steht auch so auf der Seite.

| Der Mitarbeiter kann | Was passiert |
|---|---|
| seine nächsten vier Wochen sehen | nur eigene, nur veröffentlichte Schichten |
| **Kann nicht** (krank/verhindert) | Chef bekommt es sofort aufs Handy; erst wenn er zustimmt, wird die Schicht frei |
| **Tauschen** — Kollegen auswählen | Chef entscheidet; bei Zustimmung wandert die Schicht |
| sich auf eine **freie Schicht** melden | Chef teilt zu |

Nichts davon ändert den Plan von allein. Der Chef tippt „Passt" oder „Nein",
und das System zieht die Folgen: Schicht wird frei, wandert zum Kollegen oder
wird zugeteilt. Beide Seiten bekommen eine Mitteilung.

### Soll gegen Ist

Der Plan weiß, wer wann da sein sollte; die Stempeluhr weiß, wer wirklich da
war. Aus beidem entsteht die Abweichung je Tag und Mitarbeiter — und der
Auslöser **„Nicht erschienen"**.

## Mitteilungen aufs Handy

Ohne fremden Dienst, ohne Konto, ohne laufende Kosten: **Web Push**. Der
Browser meldet sich selbst beim Push-Dienst seines Herstellers an (Google bei
Android, Apple beim iPhone), der Laden-PC verschlüsselt die Nachricht so, dass
**nur dieses eine Gerät** sie lesen kann, und legt sie dort ab.

Umgesetzt sind zwei Normen, beide mit Bordmitteln von Node — kein `npm install`:

| Norm | Wofür |
|---|---|
| **RFC 8291** | Verschlüsselung des Inhalts (ECDH P-256, HKDF, AES-128-GCM) |
| **RFC 8292** | VAPID: der Laden-PC unterschreibt mit eigenem Schlüsselpaar |

Geprüft gegen die Beispielwerte des RFC **und** gegen eine völlig
unabhängige fremde Umsetzung — beide lesen unsere Nachrichten, wir lesen
ihre. Dazu ein nachgebauter Push-Dienst, der bestätigt: der Dienst selbst
sieht nur Kauderwelsch, ein fremdes Gerät kann nichts entschlüsseln.

### Wobei es klingelt

| Auslöser | Wer bekommt es |
|---|---|
| **Ausstempeln vergessen** | Chef („bitte nachtragen") und der Mitarbeiter selbst |
| **Nicht erschienen** | Chef, sobald eine geplante Schicht X Minuten läuft und niemand gestempelt hat — einmal je Schicht, nicht im Minutentakt |
| Krankmeldung / Tausch / Bewerbung | Chef sofort; die Antwort geht zurück an den Mitarbeiter |
| Neuer Schichtplan | nur die betroffenen Mitarbeiter, nur beim Veröffentlichen |

### Einrichten

* **Chef:** *Einstellungen → Mitteilungen aufs Handy* → Schalter an. Es kommt
  sofort eine Testmeldung.
* **Mitarbeiter:** *Mein Plan → Mitteilungen* → Schalter an.
* **Auf dem iPhone** geht das nur, wenn die Seite über *Teilen → Zum
  Home-Bildschirm* abgelegt und **von dort** geöffnet wurde (ab iOS 16.4).
  Das steht auch so auf dem Bildschirm, statt dass einfach nichts passiert.
  Auf Android läuft es sofort.
* Braucht HTTPS — der Tailscale-Funnel liefert das.

**Ehrlich dazu:** Ist der Laden-PC aus, wird nichts verschickt; die Meldung
kommt dann verspätet, wenn er wieder läuft. Und wer das Icon vom
Home-Bildschirm löscht, muss es einmal neu erlauben.

## Stundenzettel für den Steuerberater

*Zeiten → Zeitraum wählen → Stundenzettel (PDF)*. Eine saubere Seite je
Mitarbeiter und Monat: Tag, Kommen, Gehen, Pause, Stunden, Hinweis
(automatisch beendet, fehlender Stempel …), Wochensummen, Gesamtsumme und
Unterschriftszeilen für Mitarbeiter und Arbeitgeber. Mehrere Mitarbeiter
landen in **einer** Datei, jeweils auf eigenen Seiten.

Das PDF wird direkt vom Laden-PC erzeugt — auch hier ohne Bibliothek.
Schrift ist Helvetica, die in jedem PDF-Betrachter fest eingebaut ist;
Zeichensatz WinAnsi, damit Umlaute überall richtig ankommen. Geprüft mit
einem fremden PDF-Werkzeug: Text lesbar, Umlaute korrekt, Seitenumbrüche
sauber.

## Automatisches Ausstempeln

Wer das Ausstempeln vergisst, wird nach einer einstellbaren Zeit (Standard 12 h)
automatisch ausgestempelt — und der Eintrag landet unter *Zu prüfen*. Es wird
also **nie still etwas erfunden**, du bestätigst oder korrigierst jeden Fall.

Zusätzlich räumt das System auf, sobald jemand neu einstempelt: Eine vergessene
Schicht von vorgestern blockiert nicht die neue Schicht heute.

## Warum das nicht kaputtgeht

1. **Jeder Stempel wird sofort an `stempel.log` angehängt** — eine reine
   Textdatei, die nie umgeschrieben wird. Selbst bei Stromausfall mitten im
   Speichern sind alte Stempel unversehrt.
2. Der Gesamtzustand liegt zusätzlich als JSON vor, geschrieben über
   temporäre Datei + Umbenennen (entweder ganz alt oder ganz neu, nie halb).
3. Ist die JSON-Datei doch mal beschädigt, stellt der Server die Stempel beim
   Start automatisch aus dem Log wieder her.
4. **Keine fremden Bibliotheken.** Kein `npm install`, nichts, was veralten oder
   brechen kann.

## Rechtliches (kurz)

Arbeitszeiten müssen in Deutschland aufgezeichnet und **zwei Jahre** aufbewahrt
werden. Deshalb protokolliert das System jede Korrektur mit Zeitpunkt und
Beschreibung — nachvollziehbar bleibt, wer wann was geändert hat. Der optionale
Pausenabzug folgt § 4 ArbZG (über 6 h → 30 min, über 9 h → 45 min).
Das ersetzt keine Rechtsberatung; im Zweifel kurz mit der Steuerberatung
abstimmen.

**Datenschutz:** Alles bleibt auf deinem PC. Gespeichert werden nur Name, Code
(als Prüfsumme, nicht im Klartext), optional ein Foto und die Stempelzeiten.

## Installation auf dem Laden-PC

Vom Mac aus den Ordner rüberkopieren:

```
scp -r ~/Documents/GitHub/reddit-like-app/zeit shaw@100.114.126.37:C:/KingsleyZeit
```

Dann per SSH oder AnyDesk auf dem PC:

```
cd C:\KingsleyZeit
ZEIT-einrichten.bat        (Rechtsklick → Als Administrator ausführen)
```

Das Skript prüft Node.js (installiert es bei Bedarf), richtet den Autostart ein,
öffnet die Firewall und schaltet den öffentlichen Zugang über Tailscale frei.

## Adressen

| Zweck | Adresse |
|---|---|
| iPad im Laden (Regelfall) | Adresse + `/terminal/<CODE>` — einmal öffnen, dann dauerhaft |
| Stempeln per Code (Notfall) | Adresse allein, z. B. `http://<PC-IP>:8792/` |
| Von überall erreichbar | `https://<dein-name>.ts.net:8443/` |
| Chef-Bereich | Adresse + `/chef` |
| NFC-Aufkleber am Eingang | Adresse + `/s/<CODE>` (leitet auf wechselnden Link weiter) |
| Chef von unterwegs (Internet) | Adresse + `/f/<geheim>` — einmal pro Gerät |

**iPad einrichten:** Die Terminal-Adresse in Safari öffnen → *Teilen* → *Zum
Home-Bildschirm*. Danach läuft die Stempeluhr im Vollbild ohne Browser-Leiste.
Die volle Adresse (`…/terminal/<CODE>`) **bleibt dabei genau so stehen** — sie
ist der Schlüssel des Geräts und funktioniert auch aus der Home-App heraus
(die hat auf dem iPad einen eigenen, leeren Cookie-Speicher; deshalb trägt die
Seite ihren Code selbst in der Adresse). Für Dauerbetrieb außerdem in den
iPad-Einstellungen *Automatische Sperre → Nie* setzen und das iPad am Strom
lassen.

Auch der **Chef-Bereich** lässt sich als Home-App ablegen (öffnet im
Vollbild); die Anmeldung hält dort 12 Stunden, danach fragt er wieder nach
der PIN.

Den genauen NFC-Link zeigt der Chef-Bereich unter *Einstellungen* — dort gibt es
auch den QR-Code zum Ausdrucken.

## Mehrere Standorte (2, 3 oder mehr)

**Ein Server für alle Läden.** Es gibt nichts zu synchronisieren und keinen
zweiten PC. Die anderen Läden erreichen denselben Server über die öffentliche
Adresse.

Unter *Einstellungen → Standorte* legst du je Laden einen an. Jeder bekommt:

- einen **eigenen Code** und damit eigene iPad- und Aufkleber-Adressen
- **eigene Öffnungszeiten** (oder die allgemeine Einstellung, wenn abgeschaltet)
- sein **eigenes iPad**, das nur die Mitarbeiter dieses Standorts zeigt

Im Dashboard erscheint ab dem zweiten Standort oben eine **Filterleiste**
(*Alle Läden · Laden 1 · Laden 2 …*). Sie wirkt auf *Jetzt*, *Zeiten* und
*Zu prüfen* gleichzeitig — du siehst also mit einem Klick nur den Laden, der
dich gerade interessiert, oder alles zusammen.

**Wichtig für den zweiten Laden:** Unter *Einstellungen → Öffentliche Adresse*
muss die Funnel-Adresse eingetragen sein (`https://…ts.net:8443`). Sonst zeigen
die erzeugten iPad- und Aufkleber-Links auf eine Adresse, die nur im ersten
Laden erreichbar ist.

Mitarbeiter haben einen **Heimatstandort** und können zusätzlich als
*„auch einsetzbar in …"* weiteren Läden zugeteilt werden (im Team-Bereich).
Sie erscheinen dann auf den iPads und im Schichtplan aller dieser Läden.
Stempeln können sie ohnehin überall — die Auswertung zeigt dir, wo gestempelt
wurde.
