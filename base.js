MuteAllChatPlugin.prototype.start = function () {
  this.modifyContextMenu();
  this.watchGameActivity();
};

MuteAllChatPlugin.prototype.stop = function () {
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
};
