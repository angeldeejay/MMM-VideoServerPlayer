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

  _broadcastIntervalId: null,
  _lastVideoPath: null,

  start() {
    this.info("Starting");
    this.busy = false;
    this.shuffle = true;
    this.videos = [];
    this.changeTimeout = null;
    this.currentVideo = null;
    this._lastVideoPath = null;

    this._broadcastIntervalId = setInterval(() => {
      if (this.busy || this.currentVideo === null) return;
      this._sendNotification("CURRENT_VIDEO", this.currentVideo);
    }, 1000);

    this.setProxy();
    this.info("Started");
  },

  stop() {
    if (this._broadcastIntervalId !== null) {
      clearInterval(this._broadcastIntervalId);
      this._broadcastIntervalId = null;
    }
    if (this.changeTimeout !== null) {
      clearTimeout(this.changeTimeout);
      this.changeTimeout = null;
    }
  },

  log(msg, ...args) { Log.log(`${this.logPrefix}${msg}`, ...args); },
  info(msg, ...args) { Log.info(`${this.logPrefix}${msg}`, ...args); },
  debug(msg, ...args) { Log.debug(`${this.logPrefix}${msg}`, ...args); },
  error(msg, ...args) { Log.error(`${this.logPrefix}${msg}`, ...args); },
  warning(msg, ...args) { Log.warn(`${this.logPrefix}${msg}`, ...args); },

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  _resolveVideoPath(videoPath) {
    if (!videoPath) return null;
    return path.isAbsolute(videoPath)
      ? videoPath
      : path.resolve(__dirname, videoPath);
  },

  _scanDirectory(videoPath) {
    const resolved = this._resolveVideoPath(videoPath);
    if (!resolved) return [];

    try {
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        this.warning(`Video path not found or not a directory: ${resolved}`);
        return [];
      }
      return fs.readdirSync(resolved)
        .map(f => path.join(resolved, f))
        .filter(f => {
          try {
            return fs.statSync(f).isFile() && (mime.getType(f) ?? "").startsWith("video/");
          } catch {
            return false;
          }
        });
    } catch (err) {
      this.error(`Failed to scan directory ${resolved}: ${err.message}`);
      return [];
    }
  },

  _buildVideoList(filePaths, shuffle) {
    const ordered = shuffle ? this.shuffleArray([...filePaths]) : filePaths;
    this.videos = ordered.map((v, i) => ({
      index: i,
      name: path.basename(v),
      video: v,
      size: fs.statSync(v).size,
      type: mime.getType(v)
    }));
    this.info(`Loaded ${this.videos.length} video(s)`);

    // If currently playing a video that no longer exists, reset
    if (this.currentVideo !== null) {
      const stillExists = this.videos.some(v => v.video === this.currentVideo.video);
      if (!stillExists) {
        this.currentVideo = null;
        if (this.changeTimeout !== null) {
          clearTimeout(this.changeTimeout);
          this.changeTimeout = null;
        }
      }
    }
  },

  processConfig(payload) {
    if (this.busy) return;
    this.busy = true;

    const videoPath = payload.videoPath ?? "";
    const shuffle = payload.shuffle ?? true;
    const scanned = this._scanDirectory(videoPath);

    const currentPaths = this.videos.map(v => v.video);
    const pathsChanged =
      scanned.length !== currentPaths.length ||
      scanned.some(p => !currentPaths.includes(p));

    if (pathsChanged || shuffle !== this.shuffle) {
      this.shuffle = shuffle;
      this._buildVideoList(scanned, shuffle);
    }

    if (this.videos.length > 0 && this.currentVideo === null) {
      this.setCurrentVideo();
    }

    this.busy = false;
  },

  setCurrentVideo(index = 0, delay = 0) {
    if (this.changeTimeout !== null) return;
    if (!this.videos[index]) return;

    this.debug(
      `Video will change to ${this.videos[index].name}` +
      (delay > 0 ? ` in ${delay}ms` : " now")
    );

    this.changeTimeout = setTimeout(() => {
      this.currentVideo = this.videos[index];
      this.debug(`Video changed to ${this.currentVideo.video}`);
      this._sendNotification("CURRENT_VIDEO", this.currentVideo);
      this.changeTimeout = null;
    }, delay);
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

      case "NEXT": {
        if (
          this.changeTimeout !== null ||
          this.videos.length === 0 ||
          this.currentVideo === null
        ) break;

        const currentIndex = payload?.index ?? this.videos.length;
        const timeout = Math.max(0, (payload?.timeout ?? 1) - 1);
        const nextIndex = (currentIndex + 1) % this.videos.length;
        if (nextIndex === this.currentVideo.index) break;
        this.setCurrentVideo(nextIndex, timeout);
        break;
      }

      default:
    }
  },

  setProxy() {
    this.expressApp.set("etag", false);
    this.expressApp.use(`/${this.name}/video`, nocache(), (req, res) => {
      if (this.currentVideo === null) {
        res.sendStatus(504);
        return;
      }

      const { video, size, type } = this.currentVideo;
      res.writeHead(200, {
        "Content-Length": size,
        "Content-Type": type
      });

      const stream = fs.createReadStream(video);
      req.on("close", () => stream.destroy());
      stream.on("error", (err) => {
        this.error(`Stream error for ${video}: ${err.message}`);
        if (!res.headersSent) res.sendStatus(500);
      });
      stream.pipe(res);
    });

    this.info(`Proxy created: /${this.name}/video`);
  }
});
