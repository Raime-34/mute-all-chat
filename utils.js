/**
 * Собирает голосовые соединения Discord, у которых есть setLocalMute.
 * @returns { Array } Соединения с контекстом default
 */
MuteAllChatPlugin.prototype.getMediaConnections = function () {
  const found = [];
  const push = (connection) => {
    if (!connection || typeof connection.setLocalMute !== "function") return;
    if (connection.context && connection.context !== "default") return;
    if (!found.includes(connection)) found.push(connection);
  };

  const engine = this.MediaEngineStore.getMediaEngine?.();
  if (engine?.connections) {
    for (const connection of engine.connections) push(connection);
  }
  engine?.eachConnection?.((connection) => push(connection));

  return found;
};

/**
 * Возвращает запись пользователя в конфиге. Создаёт её, если записи ещё нет.
 * @param { string } userId Пользователь, для которого нужна запись
 * @returns { object } Запись вида { muted }
 */
MuteAllChatPlugin.prototype.ensureUser = function (userId) {
  const value = this.config.users[userId];
  if (!value) {
    this.config.users[userId] = { muted: false };
  }
  return this.config.users[userId];
};

MuteAllChatPlugin.prototype.ensureRestrictedGamesList = function () {
  if (!this.config.restrictedGames) {
    this.config.restrictedGames = new Set();
  }
};

/**
 * Проверяет, отмечен ли пользователь галочкой Mute в конфиге.
 * @param { string } userId Пользователь, которого проверяют
 * @returns { boolean } true, если в конфиге muted включён
 */
MuteAllChatPlugin.prototype.isMarkedForMute = function (userId) {
  const value = this.config.users[userId];
  return !!value && value.muted === true;
};

/**
 * Сохраняет текущую локальную громкость участников голосового канала, если она ещё не записана.
 * @returns { Error } Ошибка, если нет подключения к голосовому каналу
 */
MuteAllChatPlugin.prototype.saveInitialVolume = function () {
  const currentChannelID = this.RTCConnectionStore.getChannelId();
  if (!currentChannelID) {
    return new Error("Not connected to a voice channel");
  }

  const usersVoiceInfo =
    this.VoiceStateStore.getVoiceStatesForChannel(currentChannelID);

  for (const user of Object.values(usersVoiceInfo ?? {})) {
    const entry = this.ensureUser(user.userId);
    if (entry.volume == null) {
      entry.volume = this.MediaEngineStore.getLocalVolume(user.userId);
    }
  }
};
