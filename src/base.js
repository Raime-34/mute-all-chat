/**
 * Включает меню, поповер, слежку за играми и чинит уже сохранённые громкости.
 */
MuteAllChatPlugin.prototype.start = function () {
  this.modifyContextMenu();
  this.patchUserPopout();
  this.watchGameActivity();
  this.repairLocalVolumes();
  this.watchAudioActions();
};

/**
 * Снимает патчи, снимает свой мут и возвращает обычную громкость тем, кого плагин приглушил.
 */
MuteAllChatPlugin.prototype.stop = function () {
  clearTimeout(this.syncTimer);
  this.syncTimer = null;
  this.unpatchMenu?.();
  this.unpatchPopout?.();
  this.unpatchAudio?.();
  this.PresenceStore?.removeChangeListener(this.onPresence);
  for (const userId of this.mutedByPlugin) {
    try {
      this.applyLocalMute(userId, false);
    } catch (error) {
      console.error("[MuteAllChat]", error);
    }
  }
  for (const userId of this.duckedByPlugin) {
    try {
      this.applyLocalVolume(userId, this.getRegularVolume(userId));
    } catch (error) {
      console.error("[MuteAllChat]", error);
    }
  }
  this.mutedByPlugin.clear();
  this.duckedByPlugin.clear();
};
