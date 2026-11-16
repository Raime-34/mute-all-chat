MuteAllChatPlugin.prototype.watchGameActivity = function () {
  this.onPresence = () => {
    if (this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      try {
        this.syncGameMutes(); // !
      } catch (error) {
        console.error("[MuteAllChat]", error);
      }
    }, 0);
  };

  this.PresenceStore.addChangeListener(this.onPresence);
  this.onPresence();
};
