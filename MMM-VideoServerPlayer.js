/* global Module */

/* Magic Mirror
 * Module: MMM-VideoServerPlayer
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */
Module.register("MMM-VideoServerPlayer", {
  /**
   * @member {Object} defaults - Defines the default config values.
   * @property {int} updateInterval Default time to show next source (in milliseconds). Defaults to 30000.
   * @property {int} retryDelay Time to wait to refresh DOM when server and feeds are alive (in milliseconds). Defaults to 5000.
   * @property {boolean} controls If video player should show its controls. Defaults to false.
   * @property {int} height video player height. Defaults to 350.
   * @property {int} width video player width. Defaults to 700.
   * @property {int} animationSpeed Animation speed to update DOM. Defaults to 400.
   * @property {str[]} sources sources list (rtsp urls to proxy. e.g rtsp://x.x.x.x:8554/live).
   */
  defaults: {
    videos: [],
    width: 640,
    height: 480,
    shuffle: true
  },
  name: "MMM-VideoServerPlayer",
  logPrefix: "MMM-VideoServerPlayer :: ",
  // Required version of MagicMirror
  requiresVersion: "2.1.0",
  // Placeholders
  wrapper: null,
  playerWrapper: null,
  player: null,
  ready: false,
  currentVideo: null,

  // Overrides start method
  start() {
    this.log("Starting");
    this.config = {
      ...this.defaults,
      ...this.config,
      videos: (this.config.videos ?? []).filter(
        (v, i, self) => self.indexOf(v) === i
      ),
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
    this.createWrapper();
    this.updateDom();
    setInterval(() => {
      this.sendNotification("SET_CONFIG", {
        videos: this.config.videos,
        shuffle: this.config.shuffle
      });
    }, 1000);
    this.log("Started");
  },

  // Logging wrapper
  log(msg, ...args) {
    Log.log(`${this.logPrefix}${msg}`, ...args);
  },
  info(msg, ...args) {
    Log.info(`${this.logPrefix}${msg}`, ...args);
  },
  debug(msg, ...args) {
    Log.debug(`${this.logPrefix}${msg}`, ...args);
  },
  error(msg, ...args) {
    Log.error(`${this.logPrefix}${msg}`, ...args);
  },
  warning(msg, ...args) {
    Log.warn(`${this.logPrefix}${msg}`, ...args);
  },

  changeCurrentVideo(videoData) {
    if (
      typeof videoData !== "object" ||
      videoData === null ||
      !Object.prototype.hasOwnProperty.call(videoData, "name") ||
      (this.currentVideo !== null && videoData.name === this.currentVideo.name)
    )
      return;

    if (!this.ready) {
      setTimeout(() => this.changeCurrentVideo(videoData), 500);
      return;
    }
    this.player.pause();
    this.currentVideo = videoData;
    this.info(`Playing now: ${videoData.name}`);
    this.player.src({
      src: `/${this.name}/video`,
      type: this.currentVideo.type
    });
    this.player.play();
  },

  /**
   * Detects if player is in fullscreen region
   * @param {DOMElement} element
   * @returns
   */
  inFullscreenRegion(element) {
    if (element.parentNode) {
      if (
        element.parentNode.classList &&
        element.parentNode.classList.contains("region") &&
        element.parentNode.classList.contains("fullscreen")
      ) {
        return true;
      } else {
        return this.inFullscreenRegion(element.parentNode);
      }
    }
    return false;
  },

  deletePlayer() {
    try {
      this.player.dispose();
    } catch (_) {}
    this.player = null;
  },

  /**
   * Create wrapper DOM element
   */
  createWrapper() {
    this.wrapper = document.createElement("div");
    this.wrapper.classList.add(`wrapper_${this.name}`);
    setTimeout(() => this.createPlayerWrapper(), 1);
  },

  /**
   * Create player wrapper DOM element
   */
  createPlayerWrapper() {
    if (!this.wrapper || this.wrapper.offsetParent === null) {
      setTimeout(() => this.createPlayerWrapper(), 1000 / 3);
      return;
    }
    if (this.playerWrapper !== null) {
      return;
    }
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
      setTimeout(() => this.createPlayer(), 1);
    } catch (e) {
      setTimeout(() => this.createPlayerWrapper(), 1000 / 3);
    }
  },

  /**
   * Creates a player instance
   */
  createPlayer() {
    if (!this.playerWrapper || this.playerWrapper.offsetParent === null) {
      setTimeout(() => this.createPlayer(), 1000 / 3);
      return;
    }
    if (this.player !== null) {
      return;
    }

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

      this.player.ready((err, ..._) => {
        if (err) {
          this.deletePlayer();
          setTimeout(() => this.createPlayerWrapper(), 1000 / 3);
          return;
        }
        this.player.on("timeupdate", () => {
          const timeToEnd = this.player.duration() - this.player.currentTime();
          if (timeToEnd < 1) {
            this.sendSocketNotification("NEXT", {
              ...this.currentVideo,
              timeout: Math.max(0, timeToEnd * 1000 - 100)
            });
          }
        });
        this.player.on("error", (error) => {
          this.error(error);
          this.sendNotification("NEXT", {
            ...this.currentVideo,
            timeout: 0
          });
        });

        this.ready = true;
      });
    } catch (e) {
      this.deletePlayer();
      setTimeout(() => this.createPlayerWrapper(), 1000 / 3);
    }
  },

  // Override function to retrieve DOM elements
  getDom() {
    return this.wrapper;
  },

  /**
   * Notification send helper method
   * @param {string} notification notification type
   * @param {any} payload notification payload
   */
  sendNotification: function (notification, payload) {
    this.sendSocketNotification(`${this.name}-${notification}`, payload);
  },

  // Override socket notification received method
  socketNotificationReceived: function (notification, payload) {
    switch (notification.replace(`${this.name}-`, "")) {
      case "CURRENT_VIDEO":
        if (payload !== null) this.changeCurrentVideo(payload);
        break;
      default:
    }
  },

  // Load scripts
  getScripts() {
    const loadedLanguage = this.config.lang || this.language || "en";
    return [
      this.file("node_modules/video.js/dist/video.min.js"),
      this.file("node_modules/videojs-errors/dist/videojs-errors.min.js"),
      this.file(`node_modules/videojs-errors/dist/lang/${loadedLanguage}.js`)
    ];
  },

  // Load stylesheets
  getStyles() {
    return [
      this.file("node_modules/video.js/dist/video-js.min.css"),
      this.file("node_modules/videojs-errors/dist/videojs-errors.css"),
      `${this.name}.css`
    ];
  }
});
