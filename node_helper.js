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
const nocache = require("nocache");

module.exports = NodeHelper.create({
  name: path.basename(__dirname),
  logPrefix: `${path.basename(__dirname)} :: `,
  videos: [],
  currentVideo: null,
  changeTimeout: null,
  busy: false,
  shuffle: true,

  start() {
    this.busy = false;
    this.shuffle = true;
    this.videos = [];
    this.changeTimeout = null;
    this.currentVideo = null;
    setInterval(() => {
      if (this.busy || this.currentVideo === null) return;
      this._sendNotification("CURRENT_VIDEO", this.currentVideo);
    }, 1000);
    this.setProxy();
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
      .map((v) => v.video)
      .filter((v, i, self) => self.indexOf(v) === i)
      .filter((v) => fs.existsSync(v));
    const newVideos = payloadVideos.filter((v) => !currentVideos.includes(v));
    const delVideos = currentVideos.filter((v) => !payloadVideos.includes(v));
    const changes = newVideos.length + delVideos.length;
    if (changes > 0 || this.shuffle !== config.shuffle) {
      Log.info(`${this.logPrefix}${changes} videos received`);
      this.shuffle = config.shuffle;
      this.videos = (
        this.shuffle ? this.shuffleArray(payloadVideos) : payloadVideos
      ).map((v, i) => {
        return {
          index: i,
          name: path.basename(v),
          video: v,
          size: fs.statSync(v).size,
          type: mime.getType(v)
        };
      });
    }

    if (this.videos.length > 0 && this.currentVideo === null) {
      this.setCurrentVideo();
    }
    this.busy = false;
  },

  setCurrentVideo(index = 0, timeout = 0) {
    this.currentVideo = this.videos[index];
    if (this.changeTimeout !== null) return;

    this.changeTimeout = setTimeout(() => {
      Log.info(
        `${this.logPrefix}Setting current video to ${JSON.stringify(
          this.currentVideo,
          null,
          2
        )}`
      );
      this._sendNotification("CURRENT_VIDEO", this.currentVideo);
      this.changeTimeout = null;
    }, timeout);
  },

  _sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}-${notification}`, payload);
  },

  socketNotificationReceived(type, payload) {
    const notification = type.replace(`${this.name}-`, "");
    switch (notification) {
      case "SET_CONFIG":
        this.processConfig(payload);
        break;
      case "NEXT":
        if (this.videos.length === 0) break;
        const currentIndex = payload?.index ?? this.videos.length;
        const timeout = Math.max(0, (payload?.timeout ?? 1) - 1);
        const nextIndex = (currentIndex + 1) % this.videos.length;
        if (nextIndex === this.currentVideo.index) return;
        this.setCurrentVideo(nextIndex, timeout);
        break;
      default:
    }
  },

  /**
   * this you can create extra routes for your module
   */
  setProxy() {
    this.expressApp.set("etag", false);
    this.expressApp.use(`/${this.name}/video`, nocache(), (req, res, ..._) => {
      if (this.currentVideo === null) {
        res.sendStatus(504);
      } else {
        res.writeHead(200, {
          "Content-Length": this.currentVideo.size,
          "Content-Type": this.currentVideo.type
        });
        fs.createReadStream(this.currentVideo.video).pipe(res);
      }
    });
    Log.info(`${this.logPrefix}Proxy created: /${this.name}/video`);
  }
});
