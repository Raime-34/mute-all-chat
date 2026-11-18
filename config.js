MuteAllChatPlugin.prototype.saveConfig = function () {
  const copy = structuredClone(this.config);
  copy.restrictedGames = [...copy.restrictedGames];
  BdApi.Data.save(this.pluginName, "config", copy);
};

MuteAllChatPlugin.prototype.loadConfig = function () {
  return BdApi.Data.load(this.pluginName, "config");
};
