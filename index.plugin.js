/**
 * @name MuteAllChat
 * @author YourName
 * @description Describe the basic functions. Maybe a support server link.
 * @version 0.0.1
 */

module.exports = class MuteAllChatPlugin {
  constructor() {
    this.pluginName = "MuteAllChat";
    this.config = this.loadConfig() ?? {
      users: {},
    };
    this.normalizeConfig();

    this.hatedGame = "356888453796986880";

    this.RTCConnectionStore = BdApi.Webpack.getStore("RTCConnectionStore");
    this.MediaEngineStore = BdApi.Webpack.getStore("MediaEngineStore");
    this.VoiceStateStore = BdApi.Webpack.getStore("VoiceStateStore");
    this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
    this.UserStore = BdApi.Webpack.getStore("UserStore");

    this.mutedByPlugin = new Set();
    this.currentUserId = this.UserStore.getCurrentUser().id;
  }

  start() {
    this.modifyContextMenu();
    this.watchGameActivity();
  }

  stop() {
    clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.unpatchMenu?.();
    this.PresenceStore?.removeChangeListener(this.onPresence);
    for (const userId of this.mutedByPlugin) {
      try {
        this.applyLocalMute(userId, false);
      } catch (error) {
        console.error("[MuteAllChat]", error);
      }
    }
    this.mutedByPlugin.clear();
  }

  modifyContextMenu = () => {
    const Slider = BdApi.Webpack.getModule(
      (exp) =>
        typeof exp === "function" &&
        exp.toString().includes("minValue") &&
        exp.toString().includes("maxValue"),
      { searchExports: true },
    );

    function findItem(node, id) {
      if (!node) return null;
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = findItem(child, id);
          if (found) return found;
        }
        return null;
      }
      if (node.props?.id === id) return node;
      return findItem(node.props?.children, id);
    }
    this.unpatchMenu = BdApi.ContextMenu.patch(
      "user-context",
      (menu, props) => {
        const userId = props.user?.id;
        if (!Slider || !userId || userId == this.currentUserId) return;
        const volumeItem = findItem(menu.props.children, "user-volume");
        const muteItem = findItem(menu.props.children, "mute");
        if (!volumeItem) return;

        const customeSlider = BdApi.React.createElement(volumeItem.type, {
          ...volumeItem.props,
          id: "mute-all-chat-regular-volume",
          label: "Regular volume",
          control: (sliderProps, ref) =>
            BdApi.React.createElement(Slider, {
              ...sliderProps,
              ref,
              minValue: 0,
              maxValue: 200,
              min: 0,
              max: 200,
              onChange: (next) => {
                console.log(next);
              },
              onValueChange: (next) => console.log(next),
              onValueRender: (value) => `${Math.round(value)}%`,
            }),
        });

        const [on, setOn] = BdApi.React.useState(
          () => this.ensureUser(userId).muted === true,
        );
        const customeSwitch = BdApi.React.createElement(muteItem.type, {
          ...muteItem.props,
          id: "mute-all-chat-mute",
          label: "Mute",
          checked: on,
          action: () => {
            const next = !this.ensureUser(userId).muted;
            this.ensureUser(userId).muted = next;
            setOn(next);
            this.saveConfig();
            console.log(
              "[MuteAllChat] checkbox",
              userId,
              next,
              this.config.users[userId],
            );
            this.syncGameMutes();
          },
        });

        const children = Array.isArray(menu.props.children)
          ? menu.props.children
          : [menu.props.children];
        menu.props.children = [...children, customeSwitch];
      },
    );
  };

  watchGameActivity = () => {
    this.onPresence = () => {
      if (this.syncTimer) return;
      this.syncTimer = setTimeout(() => {
        this.syncTimer = null;
        try {
          this.syncGameMutes();
        } catch (error) {
          console.error("[MuteAllChat]", error);
        }
      }, 0);
    };

    this.PresenceStore.addChangeListener(this.onPresence);
    this.onPresence();
  };

  syncGameMutes = () => {
    const channelId = this.RTCConnectionStore.getChannelId();
    if (!channelId) return;

    const states = Object.values(
      this.VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {},
    );
    const seen = new Set();

    for (const state of states) {
      const userId = state.userId;
      if (!userId || userId === this.currentUserId) continue;
      seen.add(userId);

      const activities = this.PresenceStore.getActivities(userId) ?? [];
      const game = activities.find(
        (activity) => activity?.type === 0 || activity?.type === "PLAYING",
      );
      const user = this.UserStore.getUser(userId);
      console.log(
        "[MuteAllChat]",
        user?.username ?? userId,
        game ?? "нет игры",
      );
      const playingHatedGame = activities.some((activity) => {
        const applicationId =
          activity?.application_id ?? activity?.applicationId;
        return String(applicationId ?? "") === this.hatedGame;
      });
      const shouldMute = this.isOptedIn(userId) && playingHatedGame;

      if (shouldMute) {
        if (this.mutedByPlugin.has(userId)) continue;
        this.mutedByPlugin.add(userId);
        this.applyLocalMute(userId, true);
        continue;
      }

      if (!this.mutedByPlugin.has(userId)) continue;
      this.mutedByPlugin.delete(userId);
      this.applyLocalMute(userId, false);
    }

    for (const userId of [...this.mutedByPlugin]) {
      if (seen.has(userId)) continue;
      this.mutedByPlugin.delete(userId);
      this.applyLocalMute(userId, false);
    }
  };

  getMediaConnections = () => {
    const found = [];
    const push = (connection) => {
      if (!connection || typeof connection.setLocalMute !== "function") return;
      if (connection.context && connection.context !== "default") return;
      if (!found.includes(connection)) found.push(connection);
    };

    const engine = this.MediaEngineStore.getMediaEngine?.();
    if (engine?.connections) {
      for (const connection of engine.connections) push(connection);
    }
    engine?.eachConnection?.((connection) => push(connection));

    return found;
  };

  getMuteAction = () => {
    if (this.muteAction !== undefined) return this.muteAction;
    this.muteAction = null;

    try {
      const found = BdApi.Webpack.getModule(
        BdApi.Webpack.Filters.byKeys("setLocalMute"),
        { searchExports: true },
      );
      const fn = found?.setLocalMute;
      if (typeof fn !== "function") return null;
      const source = Function.prototype.toString.call(fn);
      if (
        source.includes("this.localMutes") ||
        source.includes("this.localMute")
      ) {
        return null;
      }
      this.muteAction = fn.bind(found);
    } catch (error) {
      console.error("[MuteAllChat] mute action lookup failed", error);
    }

    return this.muteAction;
  };

  markStoreMuted = (userId, muted) => {
    const settings = this.MediaEngineStore.getSettings?.("default");
    if (!settings) return;
    settings.localMutes ??= {};
    settings.localMutes[userId] = muted;
    this.MediaEngineStore.emitChange?.();
  };

  applyLocalMute = (userId, muted) => {
    for (const connection of this.getMediaConnections()) {
      try {
        connection.setLocalMute(userId, muted);
      } catch (error) {
        console.error("[MuteAllChat] setLocalMute failed", error);
      }
    }

    const muteAction = this.getMuteAction();
    if (muteAction) {
      try {
        muteAction(userId, muted);
        return;
      } catch (error) {
        console.error("[MuteAllChat] mute action failed", error);
        this.muteAction = null;
      }
    }

    try {
      this.markStoreMuted(userId, muted);
    } catch (error) {
      console.error("[MuteAllChat] mute store update failed", error);
    }
  };

  normalizeConfig = () => {
    if (!this.config?.users || typeof this.config.users !== "object") {
      this.config = { users: {} };
      return;
    }

    let changed = false;
    for (const [userId, value] of Object.entries(this.config.users)) {
      if (typeof value !== "number") continue;
      this.config.users[userId] = { muted: false, volume: value };
      changed = true;
    }
    if (changed) this.saveConfig();
  };

  ensureUser = (userId) => {
    const value = this.config.users[userId];
    if (typeof value === "number") {
      this.config.users[userId] = { muted: false, volume: value };
    } else if (!value || typeof value !== "object") {
      this.config.users[userId] = { muted: false };
    }
    return this.config.users[userId];
  };

  isOptedIn = (userId) => {
    const value = this.config.users[userId];
    return !!value && typeof value === "object" && value.muted === true;
  };

  saveInitialVolume = () => {
    const currentChannelID = this.RTCConnectionStore.getChannelId();
    if (!currentChannelID) {
      return new Error("Not connected to a voice channel");
    }

    const usersVoiceInfo =
      this.VoiceStateStore.getVoiceStatesForChannel(currentChannelID);

    for (const user of Object.values(usersVoiceInfo ?? {})) {
      const entry = this.ensureUser(user.userId);
      if (entry.volume == null) {
        entry.volume = this.MediaEngineStore.getLocalVolume(user.userId);
      }
    }
  };

  saveConfig = () => {
    BdApi.Data.save(this.pluginName, "config", this.config);
  };

  loadConfig = () => {
    return BdApi.Data.load(this.pluginName, "config");
  };
};
