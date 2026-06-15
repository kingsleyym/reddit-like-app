"use strict";

const fs = require("fs");
const path = require("path");

// Default configuration. "screens" maps the three logical slots
// (left / middle / right) to a stored video filename, or null when empty.
const DEFAULT_STATE = {
  screens: {
    left: null,
    middle: null,
    right: null,
  },
  // Mapping of a logical slot to a physical display id. When null the
  // displays are assigned automatically by their horizontal position.
  displayMapping: {
    left: null,
    middle: null,
    right: null,
  },
  // Nightly power schedule. Times are "HH:MM" in 24h local time.
  schedule: {
    enabled: false,
    sleepTime: "23:30",
    wakeTime: "08:30",
  },
  // List of uploaded videos: { id, file, name, size, uploadedAt }
  videos: [],
};

class Store {
  constructor(dataFile) {
    this.dataFile = dataFile;
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, "utf8");
        const parsed = JSON.parse(raw);
        // Shallow-merge so new fields from updates get sane defaults.
        this.state = {
          ...JSON.parse(JSON.stringify(DEFAULT_STATE)),
          ...parsed,
          screens: { ...DEFAULT_STATE.screens, ...(parsed.screens || {}) },
          displayMapping: {
            ...DEFAULT_STATE.displayMapping,
            ...(parsed.displayMapping || {}),
          },
          schedule: { ...DEFAULT_STATE.schedule, ...(parsed.schedule || {}) },
          videos: Array.isArray(parsed.videos) ? parsed.videos : [],
        };
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

  removeVideo(id) {
    const video = this.state.videos.find((v) => v.id === id);
    this.state.videos = this.state.videos.filter((v) => v.id !== id);
    // Unassign it from any screen that was using it.
    for (const slot of Object.keys(this.state.screens)) {
      if (this.state.screens[slot] === id) {
        this.state.screens[slot] = null;
      }
    }
    this.save();
    return video;
  }

  assign(slot, videoId) {
    if (!(slot in this.state.screens)) {
      throw new Error("unknown screen slot: " + slot);
    }
    this.state.screens[slot] = videoId; // videoId may be null to clear
    this.save();
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
}

module.exports = { Store, DEFAULT_STATE };
