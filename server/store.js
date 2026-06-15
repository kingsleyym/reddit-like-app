"use strict";

const fs = require("fs");
const path = require("path");

// Two scenes: "day" (Tag/Mittag) and "night" (Abend). Each maps the three
// logical screen slots to a stored video id (or null). One scene is "live"
// at a time. The dashboard can switch the live scene with one tap, or it
// switches automatically by time of day.
function emptySlots() {
  return { left: null, middle: null, right: null };
}

const DEFAULT_STATE = {
  videos: [], // { id, file, name, size, uploadedAt }
  scenes: {
    day: emptySlots(),
    night: emptySlots(),
  },
  liveScene: "day", // "day" | "night"
  autoSwitch: {
    enabled: false,
    dayStart: "11:00", // switch to day scene at this time
    nightStart: "17:00", // switch to night scene at this time
  },
  schedule: {
    enabled: false,
    sleepTime: "23:30",
    wakeTime: "08:30",
  },
  displayMapping: { left: null, middle: null, right: null },
  // Start automatically with Windows. Maintenance mode is runtime-only:
  // it is reset to false on every app start so a reboot always brings the
  // board back.
  autostart: true,
  maintenance: false,
};

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

      this.state = {
        ...d,
        ...parsed,
        videos: Array.isArray(parsed.videos) ? parsed.videos : [],
        scenes: {
          day: { ...emptySlots(), ...((parsed.scenes && parsed.scenes.day) || {}) },
          night: { ...emptySlots(), ...((parsed.scenes && parsed.scenes.night) || {}) },
        },
        liveScene: parsed.liveScene === "night" ? "night" : "day",
        autoSwitch: { ...d.autoSwitch, ...(parsed.autoSwitch || {}) },
        schedule: { ...d.schedule, ...(parsed.schedule || {}) },
        displayMapping: { ...d.displayMapping, ...(parsed.displayMapping || {}) },
        autostart: parsed.autostart !== undefined ? !!parsed.autostart : true,
        maintenance: false,
      };

      // Migration from the old flat "screens" model: seed both scenes with it.
      if (parsed.screens && (!parsed.scenes)) {
        this.state.scenes.day = { ...emptySlots(), ...parsed.screens };
        this.state.scenes.night = { ...emptySlots(), ...parsed.screens };
        this.save();
      }
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
    // Unassign it from any scene/slot that referenced it.
    for (const scene of ["day", "night"]) {
      for (const slot of ["left", "middle", "right"]) {
        if (this.state.scenes[scene][slot] === id) {
          this.state.scenes[scene][slot] = null;
        }
      }
    }
    this.save();
    return video;
  }

  setSceneSlot(scene, slot, videoId) {
    if (!this.state.scenes[scene]) throw new Error("unknown scene: " + scene);
    if (!(slot in this.state.scenes[scene])) throw new Error("unknown slot: " + slot);
    this.state.scenes[scene][slot] = videoId || null;
    this.save();
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

module.exports = { Store, DEFAULT_STATE };
