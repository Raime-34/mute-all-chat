/**
 * Сохраняет конфиг плагина. Список игр перед записью превращает в массив.
 */
MuteAllChatPlugin.prototype.saveConfig = function () {
  const copy = structuredClone(this.config);
  copy.restrictedGames = [...copy.restrictedGames];
  BdApi.Data.save(this.pluginName, "config", copy);
};

/**
 * Читает конфиг плагина из данных BetterDiscord.
 * @returns { object | null } Сохранённый конфиг. Возвращает null, если его ещё нет
 */
MuteAllChatPlugin.prototype.loadConfig = function () {
  return BdApi.Data.load(this.pluginName, "config");
};
