/* Magic Mirror
 * Node Helper: "MMM-VideoServerPlayer"
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("fs");
const path = require("path");
const mime = require("mime");

module.exports = NodeHelper.create({
  name: path.basename(__dirname),
  logPrefix: `${path.basename(__dirname)} :: `,
  videos: [],
  encodedVideos: [],
  ready: false,

  start() {
    this.ready = false;
    this.videos = [];
    this.encodedVideos = [];
    this.busy = false;
    Log.info(`${this.logPrefix}Started`);
  },

  processConfig(config) {
    if (this.busy || !Object.keys(config).includes("videos")) {
      return;
    }
    this.busy = true;
    const payloadVideos = config.videos
      .filter((v, i, self) => self.indexOf(v) === i)
      .filter((v) => fs.existsSync(v));
    const currentVideos = this.videos
      .filter((v, i, self) => self.indexOf(v) === i)
      .filter((v) => fs.existsSync(v));
    const newVideos = payloadVideos.filter((v) => !currentVideos.includes(v));
    const delVideos = currentVideos.filter((v) => !payloadVideos.includes(v));
    const changes = newVideos.length + delVideos.length;
    if (changes > 0) {
      Log.debug(`${this.logPrefix}${changes} videos received`);
      this.videos = payloadVideos;
      this.updateVideos();
    } else {
      this.busy = false;
      this.ready = true;
    }
  },

  updateVideos() {
    if (this.videos.length === 0) {
      this.encodedVideos = [];
      this.sendNotification("UPDATE_VIDEOS", this.encodedVideos);
      this.busy = false;
    }
    try {
      this.encodedVideos = this.videos.map((v) => {
        Log.debug(`${this.logPrefix}Encoding video ${path.basename(v)}`);
        const videoMimeType = mime.getType(v);
        const encodedVideo = fs.readFileSync(v, { encoding: "base64" });
        return {
          name: path.basename(v),
          src: `data:${videoMimeType};base64,${encodedVideo}`,
          type: videoMimeType
        };
      });
      this.sendNotification("UPDATE_VIDEOS", this.encodedVideos);
      this.busy = false;
      this.ready = true;
    } catch (err) {
      Log.error(`${this.logPrefix}${err}`);
      setTimeout(() => this.updateVideos(), 1000);
    }
  },

  sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}-${notification}`, payload);
  },

  socketNotificationReceived(type, payload) {
    const notification = type.replace(`${this.name}-`, "");
    switch (notification) {
      case "RESET":
        this.busy = true;
        Log.debug(`${this.logPrefix}Received reset signal`);
        this.videos = [];
        this.encodedVideos = [];
        this.sendNotification("READY", true);
        this.ready = true;
        this.busy = false;
        break;
      case "SET_CONFIG":
        if (!this.busy) {
          this.processConfig(payload);
        }
        break;
      default:
    }
  }
});
