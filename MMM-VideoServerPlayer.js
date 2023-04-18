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
    video: null,
    width: 640,
    height: 480
  },
  name: "MMM-VideoServerPlayer",
  logPrefix: "MMM-VideoServerPlayer :: ",
  // Required version of MagicMirror
  requiresVersion: "2.1.0",
  // Placeholders
  wrapper: null,
  playerWrapper: null,
  player: null,

  // Overrides start method
  start() {
    this.config = {
      ...this.defaults,
      ...this.config
    };

    this.updateDom();
    this.sendNotification("RESET", true);
    setInterval(() => this.sendNotification("SET_CONFIG", this.config), 5000);
  },

  refresh: function () {
    window.location.reload(true);
  },

  updateVideo(source) {
    if (this.player === null) {
      setTimeout(() => this.updateVideo(source), 1000);
      return;
    }

    if (source !== null) {
      console.log(source);
      this.player.src(source);
      this.player.load();
      this.player.play();
    } else {
      this.player.pause();
    }
    this.updateDom();
  },

  /**
   * Notification send helper method
   * @param {string} notification notification type
   * @param {any} payload notification payload
   */
  sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}-${notification}`, payload);
  },

  // Override socket notification received method
  socketNotificationReceived(notification, payload) {
    const self = this;
    switch (notification.replace(`${this.name}-`, "")) {
      case "UPDATE_VIDEO":
        this.updateVideo(payload);
        break;
      default:
    }
  },

  // Override function to retrieve DOM elements
  getDom() {
    if (!this.wrapper) {
      this.wrapper = document.createElement("div");
      this.wrapper.classList.add(`wrapper_${this.name}`);
      this.wrapper.style.width = `${this.config.width}px`;
      this.wrapper.style.height = `${this.config.height}px`;
    } else if (
      !this.playerWrapper &&
      this.wrapper &&
      this.wrapper.offsetParent !== null
    ) {
      this.playerWrapper = document.createElement("video-js");
      this.playerWrapper.classList.add(`player_${this.name}`);
      this.playerWrapper.setAttribute("id", `player_${this.identifier}-0`);
      this.wrapper.appendChild(this.playerWrapper);
    } else if (
      !this.player &&
      this.playerWrapper &&
      this.playerWrapper.offsetParent !== null
    ) {
      try {
        this.player = videojs(this.playerWrapper, {
          autoplay: true,
          controls: false,
          muted: "muted",
          preload: "auto",
          width: this.config.width ?? this.defaults.width,
          height: this.config.height ?? this.defaults.height,
          fluid: true,
          liveui: true,
          loop: true,
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
      } catch (e) {
        if (this.player !== null) {
          try {
            this.player.dispose();
          } catch (_) {}
        }
        this.player = null;
        Log.error(e);
      }
    }
    if (this.player === null) {
      setTimeout(() => this.updateDom(), 100);
    }
    return this.wrapper;
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
