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
  currentVideo: null,
  ready: false,

  // Overrides start method
  start() {
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
    this.updateDom();
    setInterval(
      () =>
        this.sendNotification("SET_CONFIG", {
          videos: this.config.videos,
          shuffle: this.config.shuffle,
          currentIndex: this.currentVideo?.index ?? null
        }),
      1000
    );
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

    this.currentVideo = videoData;
    Log.info(`${this.logPrefix}Playing now: ${videoData.name}`);
    this.player.src({
      src: this.currentVideo.src,
      type: this.currentVideo.type
    });
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
    new Promise((resolve, reject) => {
      if (this.wrapper !== null) resolve();
      try {
        this.wrapper = document.createElement("div");
        this.wrapper.classList.add(`wrapper_${this.name}`);
        this.wrapper.style.width = `${this.config.width}px`;
        this.wrapper.style.height = `${this.config.height}px`;
        resolve();
      } catch (e) {
        reject();
      }
    })
      .then(() => {
        setTimeout(() => this.createPlayerWrapper(), 100);
      })
      .catch(() => {
        this.deletePlayer();
        setTimeout(() => this.createWrapper(), 500);
      });
  },

  /**
   * Create player wrapper DOM element
   */
  createPlayerWrapper() {
    new Promise((resolve, reject) => {
      if (!this.wrapper || this.wrapper.offsetParent === null) reject();
      if (this.playerWrapper !== null) resolve();
      try {
        this.playerWrapper = document.createElement("video-js");
        this.playerWrapper.classList.add(`player_${this.name}`);
        this.playerWrapper.setAttribute("id", `player_${this.identifier}-0`);
        this.wrapper.appendChild(this.playerWrapper);
      } catch (e) {
        reject();
      }
    })
      .then(() => {
        setTimeout(() => this.createPlayer(), 100);
      })
      .catch(() => {
        this.deletePlayer();
        setTimeout(() => this.createWrapper(), 500);
      });
  },

  /**
   * Creates a player instance
   */
  createPlayer() {
    new Promise((resolve, reject) => {
      if (!this.playerWrapper || this.playerWrapper.offsetParent === null)
        reject();
      if (this.player !== null) resolve();

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
          liveui: true,
          loop: false,
          loadingSpinner: false,
          enableSourceset: true,
          inactivityTimeout: 0,
          language: this.config.lang || this.language || "en",
          html5: {
            vhs: {
              // useDtsForTimestampOffset: true,
              experimentalBufferBasedABR: true,
              experimentalLLHLS: true,
              overrideNative: true
            },
            nativeAudioTracks: false,
            nativeVideoTracks: false
          }
        });

        this.player.pause();
        this.player.currentTime(0);
        this.player.on("ended", () =>
          this.sendNotification("NEXT", {
            currentIndex: this.currentVideo?.index ?? null
          })
        );
        this.player.on("error", (error) => {
          Log.error(`${this.logPrefix}${error}`);
          this.sendNotification("NEXT", {
            currentIndex: this.currentVideo?.index ?? null
          });
        });
        resolve();
      } catch (e) {
        reject();
      }
    })
      .then(() => {
        if (this.player === null) {
          setTimeout(() => this.createWrapper(), 500);
        } else {
          this.ready = true;
        }
      })
      .catch(() => {
        this.deletePlayer();
        setTimeout(() => this.createWrapper(), 500);
      });
  },

  // Override function to retrieve DOM elements
  getDom() {
    this.createWrapper();
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
