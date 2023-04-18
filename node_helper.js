/* Magic Mirror
 * Node Helper: "MMM-VideoServerPlayer"
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("fs");
const mime = require("mime");

module.exports = NodeHelper.create({
  name: __dirname.replace("\\", "/").split("/").pop(),
  logPrefix: `${__dirname.replace("\\", "/").split("/").pop()} :: `,
  video: null,
  encodedVideo: null,

  start() {
    this.video = null;
    this.encodedVideo = null;
    this.busy = false;
    Log.info(`${this.logPrefix}Started`);
  },

  processConfig(config, force) {
    if (this.busy) {
      return;
    }
    this.busy = true;
    if (config.video !== this.video || force) {
      this.video = config.video;
      this.updateVideo();
    } else {
      this.busy = false;
    }
  },

  updateVideo() {
    Log.info(`${this.logPrefix}Encoding video `, this.video);
    if (this.video === null) {
      this.sendNotification("UPDATE_VIDEO", this.encodedVideo);
      this.busy = false;
    }
    try {
      const videoMimeType = mime.getType(this.video);
      const encodedVideo = fs.readFileSync(this.video, { encoding: "base64" });
      this.encodedVideo = {
        src: `data:${videoMimeType};base64,${encodedVideo}`,
        type: videoMimeType
      };
      this.sendNotification("UPDATE_VIDEO", this.encodedVideo);
      this.busy = false;
    } catch (err) {
      Log.error(`${this.logPrefix}${err}`);
      setTimeout(() => this.updateVideo(), 1000);
    }
  },

  sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}-${notification}`, payload);
  },

  socketNotificationReceived(type, payload) {
    const notification = type.replace(`${this.name}-`, "");
    switch (notification) {
      case "RESET":
        this.video = null;
        this.encodedVideo = null;
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
