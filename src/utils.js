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
 * Все голосовые соединения, включая stream.
 * На стриме тоже лежит localVolumes, и протокол отправляет его вместе с мутом.
 * @returns { Array } Соединения медиадвижка
 */
MuteAllChatPlugin.prototype.getAllMediaConnections = function () {
  const found = [];
  const push = (connection) => {
    if (connection && !found.includes(connection)) found.push(connection);
  };

  const engine = this.MediaEngineStore.getMediaEngine?.();
  if (engine?.connections) {
    for (const connection of engine.connections) push(connection);
  }
  engine?.eachConnection?.(push);

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

/**
 * Создаёт список запрещённых игр в конфиге, если его ещё нет.
 */
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
 * Проверяет, отмечен ли пользователь галочкой Duck в конфиге.
 * @param { string } userId Пользователь, которого проверяют
 * @returns { boolean } true, если в конфиге ducked включён
 */
MuteAllChatPlugin.prototype.isMarkedForDuck = function (userId) {
  const value = this.config.users[userId];
  return !!value && value.ducked === true;
};

/**
 * Ползунок Discord отдаёт громкость числом или массивом из одного числа.
 * @param { number | Array<number> } value Сырое значение
 * @returns { number | null } Число в шкале громкости. Возвращает null, если значения нет
 */
MuteAllChatPlugin.prototype.asVolume = function (value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const volume = Number(raw);
  return Number.isFinite(volume) ? volume : null;
};

/**
 * Возвращает громкость, которую нужно поставить, пока пользователь приглушён.
 * Если своей нет, берёт обычную, а если и её нет — 100.
 * @param { string } userId Пользователь, чью громкость читают
 * @returns { number } Громкость в шкале 0–200
 */
MuteAllChatPlugin.prototype.getDuckedVolume = function (userId) {
  const value = this.config.users[userId];
  if (!value) return 100;
  return this.asVolume(value.duckVolume) ?? this.asVolume(value.volume) ?? 100;
};

/**
 * Возвращает обычную громкость пользователя, которая была до приглушения.
 * @param { string } userId Пользователь, чью громкость читают
 * @returns { number } Громкость в шкале 0–200. Если она не записана, возвращает 100
 */
MuteAllChatPlugin.prototype.getRegularVolume = function (userId) {
  const value = this.config.users[userId];
  return this.asVolume(value?.volume) ?? 100;
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

  this.saveConfig();
};
