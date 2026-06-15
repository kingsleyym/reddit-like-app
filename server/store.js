"use strict";

const fs = require("fs");
const path = require("path");

// Two scenes: "day" (Tag/Mittag) and "night" (Abend). Each scene maps the
// three screen slots (left/middle/right) to a PLAYLIST: an ordered list of
// entries { videoId, repeat }. "repeat" is how many times that video loops
// before the playlist advances to the next entry. The whole playlist then
// loops. A playlist with a single entry simply loops that one video forever
// (the classic menu-video case). This lets you do e.g.
//   [ menu x5, adA x1, menu x5, adB x1 ].
function emptySlots() {
  return { left: [], middle: [], right: [] };
}

const SLOTS = ["left", "middle", "right"];
const SCENES = ["day", "night"];

const DEFAULT_STATE = {
  videos: [], // { id, file, name, size, uploadedAt }
  scenes: { day: emptySlots(), night: emptySlots() },
  liveScene: "day",
  autoSwitch: { enabled: false, dayStart: "11:00", nightStart: "17:00" },
  schedule: { enabled: false, sleepTime: "23:30", wakeTime: "08:30" },
  displayMapping: { left: null, middle: null, right: null },
  autostart: true,
  maintenance: false,
};

// Accept any historical slot shape and return a clean playlist array.
//   null / undefined         -> []
//   "videoId" (old single)   -> [{ videoId, repeat: 1 }]
//   [{ videoId, repeat }]     -> validated playlist
function normalizePlaylist(val) {
  if (Array.isArray(val)) {
    return val
      .filter((e) => e && typeof e.videoId === "string")
      .map((e) => ({ videoId: e.videoId, repeat: clampRepeat(e.repeat) }))
      .slice(0, 50);
  }
  if (typeof val === "string" && val) return [{ videoId: val, repeat: 1 }];
  return [];
}

function clampRepeat(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(999, n);
}

function normalizeScene(sceneObj) {
  const out = emptySlots();
  for (const slot of SLOTS) out[slot] = normalizePlaylist(sceneObj ? sceneObj[slot] : null);
  return out;
}

class Store {
  constructor(dataFile) {
    this.dataFile = dataFile;
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const parsed = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
      const d = JSON.parse(JSON.stringify(DEFAULT_STATE));

      // Source scenes from the new model, or migrate from the very old flat
      // "screens" model if that is all we have.
      const srcScenes = parsed.scenes || (parsed.screens ? { day: parsed.screens, night: parsed.screens } : {});

      this.state = {
        ...d,
        ...parsed,
        videos: Array.isArray(parsed.videos) ? parsed.videos : [],
        scenes: {
          day: normalizeScene(srcScenes.day),
          night: normalizeScene(srcScenes.night),
        },
        liveScene: parsed.liveScene === "night" ? "night" : "day",
        autoSwitch: { ...d.autoSwitch, ...(parsed.autoSwitch || {}) },
        schedule: { ...d.schedule, ...(parsed.schedule || {}) },
        displayMapping: { ...d.displayMapping, ...(parsed.displayMapping || {}) },
        autostart: parsed.autostart !== undefined ? !!parsed.autostart : true,
        maintenance: false,
      };
      delete this.state.screens;
    } catch (err) {
      console.error("[store] could not read data file, using defaults:", err.message);
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
      fs.writeFileSync(this.dataFile, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error("[store] could not write data file:", err.message);
    }
  }

  getState() {
    return this.state;
  }

  addVideo(video) {
    this.state.videos.push(video);
    this.save();
  }

  renameVideo(id, name) {
    const v = this.state.videos.find((x) => x.id === id);
    if (v) {
      v.name = String(name || "").slice(0, 120) || v.name;
      this.save();
    }
    return v;
  }

  removeVideo(id) {
    const video = this.state.videos.find((v) => v.id === id);
    this.state.videos = this.state.videos.filter((v) => v.id !== id);
    // Drop the video from every scene/slot playlist that referenced it.
    for (const scene of SCENES) {
      for (const slot of SLOTS) {
        this.state.scenes[scene][slot] = this.state.scenes[scene][slot].filter((e) => e.videoId !== id);
      }
    }
    this.save();
    return video;
  }

  setScenePlaylist(scene, slot, playlist) {
    if (!this.state.scenes[scene]) throw new Error("unknown scene: " + scene);
    if (SLOTS.indexOf(slot) === -1) throw new Error("unknown slot: " + slot);
    this.state.scenes[scene][slot] = normalizePlaylist(playlist);
    this.save();
    return this.state.scenes[scene][slot];
  }

  setLiveScene(scene) {
    if (scene !== "day" && scene !== "night") throw new Error("unknown scene: " + scene);
    this.state.liveScene = scene;
    this.save();
  }

  setAutoSwitch(cfg) {
    this.state.autoSwitch = { ...this.state.autoSwitch, ...cfg };
    this.save();
    return this.state.autoSwitch;
  }

  setSchedule(schedule) {
    this.state.schedule = { ...this.state.schedule, ...schedule };
    this.save();
    return this.state.schedule;
  }

  setDisplayMapping(mapping) {
    this.state.displayMapping = { ...this.state.displayMapping, ...mapping };
    this.save();
  }

  setAutostart(enabled) {
    this.state.autostart = !!enabled;
    this.save();
    return this.state.autostart;
  }

  setMaintenance(enabled) {
    this.state.maintenance = !!enabled;
    this.save();
    return this.state.maintenance;
  }
}

module.exports = { Store, DEFAULT_STATE, SLOTS, SCENES };
