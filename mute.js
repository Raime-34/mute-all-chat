/**
 * Глушит отмеченных пользователей, которые играют в заданную игру.
 * Снимает мут, если игра кончилась, галочку убрали или человек вышел из голосового канала.
 */
MuteAllChatPlugin.prototype.syncGameMutes = function () {
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
    const playingHatedGame = activities.some((activity) => {
      const applicationId = activity?.application_id ?? activity?.applicationId;
      return this.config.restrictedGames.has(String(applicationId ?? ""));
    });
    const shouldMute = this.isMarkedForMute(userId) && playingHatedGame;

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

/**
 * Возаращает модуль, который под капотом может мютить пользователя по id
 * @returns { object } Модуль, который хэнддлит аудио пользователя
 */
MuteAllChatPlugin.prototype.getMuteAction = function () {
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

/**
 * Записывает локальный мут в настройки голосового движка и обновляет интерфейс.
 * @param { string } userId Пользователь, для которого ставится флаг
 * @param { boolean } muted Желаемое состояние мута
 */
MuteAllChatPlugin.prototype.markStoreMuted = function (userId, muted) {
  const settings = this.MediaEngineStore.getSettings?.("default");
  if (!settings) return;
  settings.localMutes ??= {};
  settings.localMutes[userId] = muted;
  this.MediaEngineStore.emitChange?.();
};

/**
 * Метод, который мутит или наоборот убирает мут с пользователя с userId
 * @param { string } userId Пользователя, у которого происходит переключение микрофона
 * @param { boolean } muted Желаемого состояние переключателя
 * @returns
 */
MuteAllChatPlugin.prototype.applyLocalMute = function (userId, muted) {
  for (const connection of this.getMediaConnections()) {
    // !
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
