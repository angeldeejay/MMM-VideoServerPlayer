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
  currentVideo: null,
  busy: false,
  shuffle: true,

  start() {
    this.busy = false;
    this.shuffle = true;
    this.videos = [];
    this.currentVideo = { index: null };
    Log.info(`${this.logPrefix}Started`);
  },

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  processConfig(payload) {
    if (this.busy) return;

    this.busy = true;
    const config = {
      videos: payload.videos ?? [],
      currentIndex: payload.currentIndex ?? null,
      shuffle: payload.shuffle ?? true
    };

    const payloadVideos = config.videos
      .filter((v, i, self) => self.indexOf(v) === i)
      .filter((v) => fs.existsSync(v));
    const currentVideos = this.videos
      .filter((v, i, self) => self.indexOf(v) === i)
      .filter((v) => fs.existsSync(v));
    const newVideos = payloadVideos.filter((v) => !currentVideos.includes(v));
    const delVideos = currentVideos.filter((v) => !payloadVideos.includes(v));
    const changes = newVideos.length + delVideos.length;
    if (changes > 0 || this.shuffle !== config.shuffle) {
      Log.info(`${this.logPrefix}${changes} videos received`);
      this.shuffle = config.shuffle;
      this.videos = this.shuffle
        ? this.shuffleArray(payloadVideos)
        : payloadVideos;
    }

    if (this.videos.length > 0 && this.currentVideo.index === null) {
      this.encode(0);
    }
    this.busy = false;
  },

  encode(index) {
    const v = this.videos[index];
    Log.info(`${this.logPrefix}Encoding video ${path.basename(v)}`);
    const videoMimeType = mime.getType(v);
    const encodedVideo = fs.readFileSync(v, { encoding: "base64" });
    this.currentVideo = {
      index: index,
      name: path.basename(v),
      src: `data:${videoMimeType};base64,${encodedVideo}`,
      type: videoMimeType
    };
  },

  sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}-${notification}`, payload);
  },

  socketNotificationReceived(type, payload) {
    const notification = type.replace(`${this.name}-`, "");
    const payloadIndex = payload.currentIndex ?? null;
    switch (notification) {
      case "SET_CONFIG":
        this.processConfig(payload);
        if (payloadIndex != this.currentVideo.index) {
          this.sendNotification("CURRENT_VIDEO", this.currentVideo);
        }
        break;
      case "NEXT":
        if (this.videos.length === 0) {
          this.currentVideo = { index: null };
        } else if (this.currentVideo.index === null) {
          this.encode(0);
        } else if (payloadIndex !== null) {
          const nextIndex = (payloadIndex + 1) % this.videos.length;
          if (nextIndex === 0) this.encode(0);
          else this.encode(nextIndex);
        }
        break;
      default:
    }
  }
});
