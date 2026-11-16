MuteAllChatPlugin.prototype.saveConfig = function () {
  BdApi.Data.save(this.pluginName, "config", this.config);
};

MuteAllChatPlugin.prototype.loadConfig = function () {
  return BdApi.Data.load(this.pluginName, "config");
};
