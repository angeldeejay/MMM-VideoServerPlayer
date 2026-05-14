/* global Module */

/* Magic Mirror
 * Module: MMM-VideoServerPlayer
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */
Module.register("MMM-VideoServerPlayer", {
  defaults: {
    videoPath: "",
    width: 640,
    height: 480,
    shuffle: true
  },

  name: "MMM-VideoServerPlayer",
  logPrefix: "MMM-VideoServerPlayer :: ",
  requiresVersion: "2.1.0",

  wrapper: null,
  playerWrapper: null,
  player: null,
  ready: false,
  currentVideo: null,

  _configIntervalId: null,
  _wrapperTimerId: null,
  _playerTimerId: null,
  _nextPending: false,
  _running: false,

  start() {
    this.log("Starting");
    this.config = {
      ...this.defaults,
      ...this.config,
      shuffle:
        typeof this.config.shuffle !== "undefined"
          ? this.config.shuffle !== false && this.config.shuffle !== null
          : true
    };

    this.ready = false;
    this.wrapper = null;
    this.playerWrapper = null;
    this.player = null;
    this.currentVideo = null;
    this._nextPending = false;
    this._running = true;

    this._createWrapper();
    this.updateDom();
    this._startConfigInterval();
    this.log("Started");
  },

  stop() {
    this._running = false;
    this._stopConfigInterval();
    this._clearPendingTimers();
    this._destroyPlayer();
  },

  suspend() {
    if (this.player) this.player.pause();
  },

  resume() {
    if (this.player) this.player.play();
  },

  log(msg, ...args) { Log.log(`${this.logPrefix}${msg}`, ...args); },
  info(msg, ...args) { Log.info(`${this.logPrefix}${msg}`, ...args); },
  debug(msg, ...args) { Log.debug(`${this.logPrefix}${msg}`, ...args); },
  error(msg, ...args) { Log.error(`${this.logPrefix}${msg}`, ...args); },
  warning(msg, ...args) { Log.warn(`${this.logPrefix}${msg}`, ...args); },

  _startConfigInterval() {
    this._stopConfigInterval();
    this._configIntervalId = setInterval(() => {
      this.sendSocketNotification(`${this.name}-SET_CONFIG`, {
        videoPath: this.config.videoPath,
        shuffle: this.config.shuffle
      });
    }, 1000);
  },

  _stopConfigInterval() {
    if (this._configIntervalId !== null) {
      clearInterval(this._configIntervalId);
      this._configIntervalId = null;
    }
  },

  _clearPendingTimers() {
    if (this._wrapperTimerId !== null) {
      clearTimeout(this._wrapperTimerId);
      this._wrapperTimerId = null;
    }
    if (this._playerTimerId !== null) {
      clearTimeout(this._playerTimerId);
      this._playerTimerId = null;
    }
  },

  changeCurrentVideo(videoData) {
    if (
      typeof videoData !== "object" ||
      videoData === null ||
      !Object.prototype.hasOwnProperty.call(videoData, "name") ||
      (this.currentVideo !== null && videoData.name === this.currentVideo.name)
    ) return;

    if (!this.ready) {
      setTimeout(() => this.changeCurrentVideo(videoData), 500);
      return;
    }

    this._nextPending = false;
    this.player.pause();
    this.currentVideo = videoData;
    this.info(`Playing now: ${videoData.name}`);
    this.player.src({
      src: `/${this.name}/video`,
      type: this.currentVideo.type
    });
    this.player.play();
  },

  inFullscreenRegion(element) {
    if (element.parentNode) {
      if (
        element.parentNode.classList &&
        element.parentNode.classList.contains("region") &&
        element.parentNode.classList.contains("fullscreen")
      ) return true;
      return this.inFullscreenRegion(element.parentNode);
    }
    return false;
  },

  _destroyPlayer() {
    try {
      if (this.player) this.player.dispose();
    } catch (_) {}
    this.player = null;
    this.ready = false;
  },

  _createWrapper() {
    this.wrapper = document.createElement("div");
    this.wrapper.classList.add(`wrapper_${this.name}`);
    this._wrapperTimerId = setTimeout(() => {
      this._wrapperTimerId = null;
      this._createPlayerWrapper();
    }, 1);
  },

  _createPlayerWrapper() {
    if (!this._running) return;

    if (!this.wrapper || this.wrapper.offsetParent === null) {
      this._wrapperTimerId = setTimeout(() => {
        this._wrapperTimerId = null;
        this._createPlayerWrapper();
      }, 1000 / 3);
      return;
    }

    if (this.playerWrapper !== null) return;

    try {
      const inFullscreenRegion = this.inFullscreenRegion(this.wrapper);
      this.playerWrapper = document.createElement("video");
      this.playerWrapper.setAttribute("id", `${this.identifier}-player`);
      this.playerWrapper.classList.add(
        "player",
        `player_${this.name}`,
        `player_${this.name}-${this.identifier}`
      );
      this.playerWrapper.setAttribute("crossorigin", "anonymous");
      this.playerWrapper.setAttribute("playsinline", true);

      if (!inFullscreenRegion) {
        this.wrapper.style.width = `${this.config.width}px`;
        this.wrapper.style.height = `${this.config.height}px`;
        this.playerWrapper.setAttribute("width", this.config.width);
        this.playerWrapper.setAttribute("height", this.config.height);
      }

      this.wrapper.appendChild(this.playerWrapper);
      this._playerTimerId = setTimeout(() => {
        this._playerTimerId = null;
        this._createPlayer();
      }, 1);
    } catch (_) {
      this._wrapperTimerId = setTimeout(() => {
        this._wrapperTimerId = null;
        this._createPlayerWrapper();
      }, 1000 / 3);
    }
  },

  _createPlayer() {
    if (!this._running) return;

    if (!this.playerWrapper || this.playerWrapper.offsetParent === null) {
      this._playerTimerId = setTimeout(() => {
        this._playerTimerId = null;
        this._createPlayer();
      }, 1000 / 3);
      return;
    }

    if (this.player !== null) return;

    try {
      const inFullscreenRegion = this.inFullscreenRegion(this.wrapper);
      this.player = videojs(this.playerWrapper, {
        autoplay: true,
        controls: false,
        muted: "muted",
        preload: "auto",
        ...(inFullscreenRegion
          ? { fill: true }
          : {
              width: this.config.width ?? this.defaults.width,
              height: this.config.height ?? this.defaults.height
            }),
        fluid: true,
        loop: false,
        loadingSpinner: false,
        inactivityTimeout: 0,
        html5: {
          overrideNative: true,
          nativeAudioTracks: false,
          nativeVideoTracks: false
        }
      });

      this.player.ready((err) => {
        if (err) {
          this._destroyPlayer();
          this.playerWrapper = null;
          this._wrapperTimerId = setTimeout(() => {
            this._wrapperTimerId = null;
            this._createPlayerWrapper();
          }, 1000 / 3);
          return;
        }

        this.player.on("timeupdate", () => {
          if (this._nextPending) return;
          const timeToEnd = this.player.duration() - this.player.currentTime();
          if (timeToEnd < 1) {
            this._nextPending = true;
            this.sendSocketNotification(`${this.name}-NEXT`, {
              ...this.currentVideo,
              timeout: Math.max(0, timeToEnd * 1000 - 100)
            });
          }
        });

        this.player.on("error", () => {
          this.error("Player error — requesting next video");
          this._nextPending = true;
          this.sendSocketNotification(`${this.name}-NEXT`, {
            ...this.currentVideo,
            timeout: 0
          });
        });

        this.ready = true;
      });
    } catch (_) {
      this._destroyPlayer();
      this.playerWrapper = null;
      this._wrapperTimerId = setTimeout(() => {
        this._wrapperTimerId = null;
        this._createPlayerWrapper();
      }, 1000 / 3);
    }
  },

  getDom() {
    return this.wrapper;
  },

  socketNotificationReceived(notification, payload) {
    switch (notification.replace(`${this.name}-`, "")) {
      case "CURRENT_VIDEO":
        if (payload !== null) this.changeCurrentVideo(payload);
        break;
      default:
    }
  },

  getScripts() {
    const lang = this.config.lang || this.language || "en";
    return [
      this.file("node_modules/video.js/dist/video.min.js"),
      this.file("node_modules/videojs-errors/dist/videojs-errors.min.js"),
      this.file(`node_modules/videojs-errors/dist/lang/${lang}.js`)
    ];
  },

  getStyles() {
    return [
      this.file("node_modules/video.js/dist/video-js.min.css"),
      this.file("node_modules/videojs-errors/dist/videojs-errors.css"),
      `${this.name}.css`
    ];
  }
});
