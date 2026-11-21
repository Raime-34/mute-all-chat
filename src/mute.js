/**
 * Глушит или приглушает отмеченных пользователей, которые играют в заданную игру.
 * Возвращает мут и обычную громкость, если игра кончилась, галочки убрали или человек вышел из голосового канала.
 */
MuteAllChatPlugin.prototype.syncGameMutes = function () {
  const channelId = this.RTCConnectionStore.getChannelId();
  if (!channelId) return;

  this.repairLocalVolumes();
  this.saveInitialVolume();

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
    const shouldDuck = this.isMarkedForDuck(userId) && playingHatedGame;

    if (shouldMute) {
      this.duckedByPlugin.delete(userId);
      if (this.mutedByPlugin.has(userId)) continue;
      this.mutedByPlugin.add(userId);
      this.applyLocalMute(userId, true);
      continue;
    }

    if (shouldDuck) {
      const wasMuted = this.mutedByPlugin.delete(userId);
      if (wasMuted) this.applyLocalMute(userId, false);
      if (wasMuted || !this.duckedByPlugin.has(userId)) {
        this.duckedByPlugin.add(userId);
        this.applyLocalVolume(userId, this.getDuckedVolume(userId));
      }
      continue;
    }

    const wasMuted = this.mutedByPlugin.delete(userId);
    const wasDucked = this.duckedByPlugin.delete(userId);
    if (!wasMuted && !wasDucked) continue;
    if (wasMuted) this.applyLocalMute(userId, false);
    this.applyLocalVolume(userId, this.getRegularVolume(userId));
  }

  for (const userId of new Set([...this.mutedByPlugin, ...this.duckedByPlugin])) {
    if (seen.has(userId)) continue;
    const wasMuted = this.mutedByPlugin.delete(userId);
    this.duckedByPlugin.delete(userId);
    if (wasMuted) this.applyLocalMute(userId, false);
    this.applyLocalVolume(userId, this.getRegularVolume(userId));
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
 * Заменяет в сторе Discord значения громкости, которые не являются числом.
 * Голосовой протокол пишет их как float и падает на массиве или объекте.
 */
MuteAllChatPlugin.prototype.repairVolumeMap = function (volumes, label) {
  if (!volumes) return false;

  const entries =
    volumes instanceof Map ? [...volumes.entries()] : Object.entries(volumes);
  let changed = false;
  for (const [userId, stored] of entries) {
    const volume = this.asVolume(stored);
    if (volume == null) {
      console.log("[MuteAllChat] drop volume", label, userId, stored);
      if (volumes instanceof Map) volumes.delete(userId);
      else delete volumes[userId];
      changed = true;
      continue;
    }
    if (stored !== volume) {
      console.log("[MuteAllChat] repair volume", label, userId, stored, volume);
      if (volumes instanceof Map) volumes.set(userId, volume);
      else volumes[userId] = volume;
      changed = true;
    }
  }
  return changed;
};

/**
 * Собирает объекты настроек звука, в которых может лежать localVolumes.
 * @returns { Array } Пары вида [подпись, настройки]
 */
MuteAllChatPlugin.prototype.audioSettingsRoots = function () {
  const roots = [];
  const push = (label, settings) => {
    if (settings) roots.push([label, settings]);
  };

  push("settings:default", this.MediaEngineStore.getSettings?.("default"));
  push("settings:stream", this.MediaEngineStore.getSettings?.("stream"));

  const state = this.MediaEngineStore.getState?.();
  const contexts = state?.settingsByContext;
  if (contexts) {
    for (const [context, settings] of Object.entries(contexts)) {
      push(`state:${context}`, settings);
    }
  }

  return roots;
};

/**
 * Проходит по картам громкости и заменяет значения, которые не являются числом.
 * Иначе голосовой протокол падает, когда пишет их как float.
 */
MuteAllChatPlugin.prototype.repairLocalVolumes = function () {
  if (!this.loggedAudioShape) {
    this.loggedAudioShape = true;
    const state = this.MediaEngineStore.getState?.();
    console.log("[MuteAllChat] audio shape", {
      stateKeys: state ? Object.keys(state) : null,
      contexts: state?.settingsByContext
        ? Object.keys(state.settingsByContext)
        : null,
    });
  }

  let changed = false;
  for (const [label, settings] of this.audioSettingsRoots()) {
    changed = this.repairVolumeMap(settings.localVolumes, `${label}.localVolumes`) || changed;
    changed =
      this.repairVolumeMap(
        settings.audioContextSettings?.localVolumes,
        `${label}.audioContextSettings.localVolumes`,
      ) || changed;

    for (const [userId, pan] of Object.entries(settings.localPans ?? {})) {
      const left = this.asVolume(pan?.left);
      const right = this.asVolume(pan?.right);
      if (left == null || right == null) {
        console.log("[MuteAllChat] drop pan", label, userId, pan);
        delete settings.localPans[userId];
        changed = true;
      }
    }
  }

  for (const connection of this.getAllMediaConnections()) {
    const context = connection.context ?? "unknown";
    changed =
      this.repairVolumeMap(
        connection.localVolumes,
        `connection:${context}.localVolumes`,
      ) || changed;
  }

  if (changed) this.MediaEngineStore.emitChange?.();
};

/**
 * Записывает локальную громкость в настройки голосового движка и обновляет интерфейс.
 * @param { string } userId Пользователь, для которого ставится громкость
 * @param { number } volume Громкость в шкале 0–200
 */
MuteAllChatPlugin.prototype.markStoreVolume = function (userId, volume) {
  const settings = this.MediaEngineStore.getSettings?.("default");
  if (!settings) return;
  settings.localVolumes ??= {};
  settings.localVolumes[userId] = volume;
  this.MediaEngineStore.emitChange?.();
};

/**
 * Ставит локальную громкость пользователя.
 * @param { string } userId Пользователь, которому меняют громкость
 * @param { number } volume Громкость в шкале 0–200
 */
MuteAllChatPlugin.prototype.applyLocalVolume = function (userId, volume) {
  volume = this.asVolume(volume);
  if (volume == null) return;

  this.repairLocalVolumes();
  this.markStoreVolume(userId, volume);

  for (const connection of this.getMediaConnections()) {
    if (connection.localVolumes) {
      for (const [id, stored] of Object.entries(connection.localVolumes)) {
        const next = this.asVolume(stored);
        if (next == null) delete connection.localVolumes[id];
        else connection.localVolumes[id] = next;
      }
    }
    if (typeof connection.setLocalVolume !== "function") continue;
    try {
      connection.setLocalVolume(userId, volume);
    } catch (error) {
      console.error("[MuteAllChat] setLocalVolume failed", error);
    }
  }
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

/**
 * Чинит громкости до того, как штатные Заглушить и Заглушить звуковую панель
 * отправят все localVolumes в голосовой протокол.
 */
MuteAllChatPlugin.prototype.watchAudioActions = function () {
  const Dispatcher =
    BdApi.Webpack.getModule(
      BdApi.Webpack.Filters.byKeys("dispatch", "subscribe"),
    ) ??
    BdApi.Webpack.getModule(
      (mod) =>
        typeof mod?.dispatch === "function" &&
        typeof mod?.subscribe === "function",
      { searchExports: true },
    );
  if (!Dispatcher) {
    console.error("[MuteAllChat] dispatcher not found");
    return;
  }

  this.audioWatchStopped = false;
  this.onAudioAction = (action) => {
    if (this.audioWatchStopped || this.repairingVolumes) return;
    if (typeof action?.type !== "string" || !action.type.startsWith("AUDIO_")) {
      return;
    }
    if (Array.isArray(action.volume)) {
      action.volume = this.asVolume(action.volume);
    }
    this.repairingVolumes = true;
    try {
      this.repairLocalVolumes();
    } finally {
      this.repairingVolumes = false;
    }
  };

  const audioActions = [
    "AUDIO_TOGGLE_SELF_MUTE",
    "AUDIO_TOGGLE_SELF_DEAF",
    "AUDIO_SET_SELF_MUTE",
    "AUDIO_SET_SELF_DEAF",
    "AUDIO_SET_LOCAL_VOLUME",
    "AUDIO_SET_LOCAL_MUTE",
  ];

  if (typeof Dispatcher.addInterceptor === "function") {
    Dispatcher.addInterceptor(this.onAudioAction);
    this.unpatchAudio = () => {
      this.audioWatchStopped = true;
      if (typeof Dispatcher.removeInterceptor === "function") {
        Dispatcher.removeInterceptor(this.onAudioAction);
        return;
      }
      const list = Dispatcher._interceptors;
      if (!list) return;
      if (typeof list.delete === "function") list.delete(this.onAudioAction);
      else if (Array.isArray(list)) {
        const index = list.indexOf(this.onAudioAction);
        if (index !== -1) list.splice(index, 1);
      }
    };
    return;
  }

  for (const type of audioActions) Dispatcher.subscribe(type, this.onAudioAction);
  this.unpatchAudio = () => {
    this.audioWatchStopped = true;
    for (const type of audioActions) {
      Dispatcher.unsubscribe(type, this.onAudioAction);
    }
  };
};
