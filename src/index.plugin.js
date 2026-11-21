/**
 * @name MuteAllChat
 * @author YourName
 * @description Describe the basic functions. Maybe a support server link.
 * @version 0.0.1
 */

class MuteAllChatPlugin {
  constructor() {
    this.pluginName = "MuteAllChat";
    this.config = this.loadConfig() ?? {
      users: {},
    };
    this.config.restrictedGames = new Set(this.config.restrictedGames ?? []);

    this.hatedGame = "356888453796986880";

    this.RTCConnectionStore = BdApi.Webpack.getStore("RTCConnectionStore");
    this.MediaEngineStore = BdApi.Webpack.getStore("MediaEngineStore");
    this.VoiceStateStore = BdApi.Webpack.getStore("VoiceStateStore");
    this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
    this.UserStore = BdApi.Webpack.getStore("UserStore");

    this.mutedByPlugin = new Set();
    this.duckedByPlugin = new Set();
    this.currentUserId = this.UserStore.getCurrentUser().id;
  }
}

module.exports = MuteAllChatPlugin;
