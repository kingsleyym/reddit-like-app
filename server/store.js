"use strict";

const fs = require("fs");
const path = require("path");

// The board drives a configurable list of SCREENS (e.g. ["left","middle",
// "right"] for the 3-HDMI setup, or ["1","2","3","4"] for the Samsung/web
// setup). Two scenes exist ("day"/"night"); each scene maps every screen id to
// a PLAYLIST: an ordered list of { videoId, repeat } entries. repeat = how many
// times that video loops before the playlist advances; the whole playlist then
// loops. A single-entry playlist just loops that one video forever.

const DEFAULT_SCREENS = ["left", "middle", "right"];
const SCENES = ["day", "night"];

function emptyScene(screens) {
  const o = {};
  for (const id of screens) o[id] = [];
  return o;
}

const DEFAULT_STATE = {
  videos: [], // { id, file, name, size, uploadedAt }
  screens: [...DEFAULT_SCREENS],
  scenes: { day: emptyScene(DEFAULT_SCREENS), night: emptyScene(DEFAULT_SCREENS) },
  liveScene: "day",
  autoSwitch: { enabled: false, dayStart: "11:00", nightStart: "17:00" },
  schedule: { enabled: false, sleepTime: "23:30", wakeTime: "08:30" },
  displayMapping: {},
  autostart: true,
  maintenance: false,
};

function clampRepeat(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(999, n);
}

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

function normalizeScreens(val, fallback) {
  if (Array.isArray(val)) {
    const ids = val.map((s) => String(s).trim()).filter(Boolean);
    const uniq = [...new Set(ids)].slice(0, 12);
    if (uniq.length) return uniq;
  }
  return [...fallback];
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

      // Old flat "screens" object model migrates into both scenes.
      const srcScenes = parsed.scenes || (parsed.screensMap ? { day: parsed.screensMap, night: parsed.screensMap } : {});

      // Determine the screen id list: explicit array > inferred from existing
      // scene keys > default 3.
      let screens;
      if (Array.isArray(parsed.screens)) {
        screens = normalizeScreens(parsed.screens, DEFAULT_SCREENS);
      } else if (srcScenes.day && Object.keys(srcScenes.day).length) {
        screens = normalizeScreens(Object.keys(srcScenes.day), DEFAULT_SCREENS);
      } else {
        screens = [...DEFAULT_SCREENS];
      }

      const buildScene = (src) => {
        const o = {};
        for (const id of screens) o[id] = normalizePlaylist(src ? src[id] : null);
        return o;
      };

      this.state = {
        ...d,
        ...parsed,
        videos: Array.isArray(parsed.videos) ? parsed.videos : [],
        screens,
        scenes: { day: buildScene(srcScenes.day), night: buildScene(srcScenes.night) },
        liveScene: parsed.liveScene === "night" ? "night" : "day",
        autoSwitch: { ...d.autoSwitch, ...(parsed.autoSwitch || {}) },
        schedule: { ...d.schedule, ...(parsed.schedule || {}) },
        displayMapping: parsed.displayMapping && typeof parsed.displayMapping === "object" ? parsed.displayMapping : {},
        autostart: parsed.autostart !== undefined ? !!parsed.autostart : true,
        maintenance: false,
      };
      delete this.state.screensMap;
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

  // Set the list of screen ids. Existing playlists for surviving ids are kept;
  // new ids start empty; removed ids are dropped.
  setScreens(ids) {
    const screens = normalizeScreens(ids, this.state.screens);
    for (const scene of SCENES) {
      const old = this.state.scenes[scene] || {};
      const next = {};
      for (const id of screens) next[id] = normalizePlaylist(old[id]);
      this.state.scenes[scene] = next;
    }
    this.state.screens = screens;
    this.save();
    return screens;
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
    for (const scene of SCENES) {
      for (const screenId of this.state.screens) {
        this.state.scenes[scene][screenId] = (this.state.scenes[scene][screenId] || []).filter((e) => e.videoId !== id);
      }
    }
    this.save();
    return video;
  }

  setScenePlaylist(scene, screenId, playlist) {
    if (!this.state.scenes[scene]) throw new Error("unknown scene: " + scene);
    if (this.state.screens.indexOf(screenId) === -1) throw new Error("unknown screen: " + screenId);
    this.state.scenes[scene][screenId] = normalizePlaylist(playlist);
    this.save();
    return this.state.scenes[scene][screenId];
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

module.exports = { Store, DEFAULT_STATE, DEFAULT_SCREENS, SCENES };
