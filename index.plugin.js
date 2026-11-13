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
      users: new Map(),
    };

    this.RTCConnectionStore = BdApi.Webpack.getStore("RTCConnectionStore");
    this.MediaEngineStore = BdApi.Webpack.getStore("MediaEngineStore");
    this.VoiceStateStore = BdApi.Webpack.getStore("VoiceStateStore");
    this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
    this.UserStore = BdApi.Webpack.getStore("UserStore");

    this.currentUserId = this.UserStore.getCurrentUser().id;
  }

  start() {
    const Slider = BdApi.Webpack.getModule(
      (exp) =>
        typeof exp === "function" &&
        exp.toString().includes("minValue") &&
        exp.toString().includes("maxValue"),
      { searchExports: true },
    );

    this.unpatchMenu = BdApi.ContextMenu.patch(
      "user-context",
      (menu, props) => {
        const userId = props.user?.id;
        if (!Slider || !userId || userId == this.currentUserId) {
          return;
        }

        const regularVolumeSlider = BdApi.ContextMenu.buildItem({
          type: "control",
          id: "mute-all-chat-regular-volume",
          label: "Regular volume",
          control: (sliderProps, ref) =>
            BdApi.React.createElement(VolumeSlider, {
              userId,
              mediaEngineStore: this.MediaEngineStore,
              sliderProps,
              sliderRef: ref,
              Slider: Slider,
            }),
        });

        const children = Array.isArray(menu.props.children)
          ? menu.props.children
          : [menu.props.children];
        menu.props.children = [...children, regularVolumeSlider];
      },
    );
  }

  stop() {
    this.unpatchMenu?.();
  }

  saveInitialVolume = () => {
    const currentChannelID = this.RTCConnectionStore.getChannelId();
    if (!currentChannelID) {
      return new Error("Not connected to a voice channel");
    }

    const usersVoiceInfo =
      this.VoiceStateStore.getVoiceStatesForChannel(currentChannelID);

    for (const user of Object.values(usersVoiceInfo)) {
      if (!this.config.users.has(user.userId)) {
        this.config.users.set(
          user.userId,
          this.MediaEngineStore.getLocalVolume(),
        );
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

function VolumeSlider({
  userId,
  mediaEngineStore,
  sliderProps,
  sliderRef,
  Slider,
}) {
  const [value, setValue] = BdApi.React.useState(
    () => mediaEngineStore.getLocalVolume(userId) ?? 100,
  );

  const handle = (next) => {
    const volume = typeof next === "number" ? next : Number(next);
    if (Number.isNaN(volume)) return;

    setValue(volume);
    mediaEngineStore.getMediaEngine().setLocalVolume(userId, volume);
  };

  return BdApi.React.createElement(Slider, {
    ...sliderProps,
    ref: sliderRef,
    minValue: 0,
    maxValue: 200,
    initialValue: value,
    value,
    onChange: handle,
    onValueChange: handle,
  });
}
