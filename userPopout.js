/**
 * Патчит поповер профиля.
 * Слушает появление .user-profile-popout: чанк с компонентом грузится только при открытии.
 * Снятие подписки лежит в this.unpatchPopout.
 * Новые элементы добавляются в onUserPopout.
 */
MuteAllChatPlugin.prototype.patchUserPopout = function () {
  const plugin = this;
  let cancel = () => {};
  let stopped = false;

  const watch = () => {
    if (stopped) return;

    const cancelAdded = BdApi.DOM.onAdded(".user-profile-popout", (node) => {
      if (stopped) return;
      plugin.attachUserPopout(node);

      const cancelRemoved = BdApi.DOM.onRemoved(node, () => {
        if (stopped) return;
        watch();
      });
      cancel = () => {
        stopped = true;
        cancelRemoved();
      };
    });

    if (typeof cancelAdded === "function") {
      cancel = () => {
        stopped = true;
        cancelAdded();
      };
    }
  };

  watch();
  this.unpatchPopout = () => cancel();
};

/**
 * Поднимается от DOM-узла к ближайшему функциональному компоненту.
 * @param { Element } node Узел, который нарисовал нужный компонент
 * @returns { object | null } Fiber этого компонента
 */
MuteAllChatPlugin.prototype.ownerFiber = function (node) {
  const getFiber = BdApi.ReactUtils?.getInternalInstance;
  if (!getFiber || !node) return null;

  let fiber = getFiber(node);
  while (fiber && typeof fiber.type !== "function") fiber = fiber.return;
  return fiber;
};

/**
 * Ищет id пользователя среди компонентов, которые собрали поповер.
 * @param { Element } node Корневой элемент поповера
 * @returns { string | null } id пользователя
 */
MuteAllChatPlugin.prototype.popoutUserId = function (node) {
  const getFiber = BdApi.ReactUtils?.getInternalInstance;
  if (!getFiber) return null;

  let fiber = getFiber(node);
  for (let steps = 0; fiber && steps < 25; steps += 1) {
    const userId = fiber.memoizedProps?.user?.id;
    if (userId) return userId;
    fiber = fiber.return;
  }
  return null;
};

/**
 * Находит компонент ряда кнопок активности и подменяет его тип.
 * Следующий рендер проходит через onUserPopout.
 * @param { Element } node Корневой элемент поповера
 */
MuteAllChatPlugin.prototype.attachUserPopout = function (node) {
  this.openedUserId = this.popoutUserId(node);

  const actions = node.querySelector("[class*='card_'] [class*='actions_']");
  if (actions) actions.style.flexDirection = "column";
  const sample = actions?.querySelector("button:not([data-mute-all-chat])");
  if (!sample || actions.querySelector("[data-mute-all-chat]")) return;

  const activity = (
    this.PresenceStore.getActivities(this.openedUserId) ?? []
  ).find((item) => item.type === 0);
  const applicationId = activity?.application_id ?? activity?.applicationId;
  if (applicationId == null) return;

  this.ensureRestrictedGamesList();
  const isRestricted = () => {
    const games = this.config.restrictedGames;
    return games.has(applicationId) || games.has(String(applicationId));
  };
  const labelText = () => (isRestricted() ? "Unmute" : "Mute");

  const mute = sample.cloneNode(true);
  mute.dataset.muteAllChat = "";
  const label =
    mute.querySelector("[data-text-variant]") ?? mute.querySelector("span");
  if (label) label.textContent = labelText();
  else mute.textContent = labelText();

  mute.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    this.ensureRestrictedGamesList();
    const games = this.config.restrictedGames;
    if (isRestricted()) {
      games.delete(applicationId);
      games.delete(String(applicationId));
    } else {
      games.add(applicationId);
    }
    if (label) label.textContent = labelText();
    else mute.textContent = labelText();

    this.saveConfig();
    this.syncGameMutes();
  });
  actions.appendChild(mute);
};

/**
 * Оборачивает функцию поповера так, чтобы её возврат прошёл через onUserPopout.
 * @param { function } original Функция компонента Discord
 * @returns { function } Обёртка, которую React будет вызывать вместо original
 */
MuteAllChatPlugin.prototype.wrapUserPopout = function (original) {
  const plugin = this;
  const wrapped = function (...args) {
    const rendered = original.apply(this, args);
    const next = plugin.onUserPopout(args[0], rendered);
    return next === undefined ? rendered : next;
  };
  original.__muteAllChat = wrapped;
  wrapped.__muteAllChat = wrapped;
  return wrapped;
};

/**
 * Собирает кнопку того же типа, что и «Играть» / «Подключить учётную запись».
 * @param { object } sample Уже существующая кнопка из этого ряда
 * @returns { object } Кнопка Mute
 */
MuteAllChatPlugin.prototype.makePopoutMuteButton = function (sample) {
  const plugin = this;
  const props = { ...(sample.props ?? {}) };
  delete props.icon;
  delete props.startIcon;
  delete props.endIcon;
  delete props.children;
  delete props["aria-expanded"];

  props.text = "balls";
  props.key = "mute-all-chat-popout";
  props.onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const userId = plugin.openedUserId;
    const activity = (plugin.PresenceStore.getActivities(userId) ?? []).find(
      (item) => item.type === 0,
    );
    const applicationId = activity?.application_id ?? activity?.applicationId;

    this.ensureRestrictedGamesList();
    this.config.restrictedGames.add(applicationId);

    plugin.saveConfig();
    plugin.syncGameMutes();
  };
  if ("text" in (sample.props ?? {})) props.text = "Mute";

  const label = props.text === "Mute" ? undefined : "Mute";
  return BdApi.React.createElement(sample.type, props, label);
};

/**
 * Дописывает кнопку Mute в ряд verticalStackedButtons.
 * Если этого ряда в дереве нет, возвращает дерево как есть.
 * @param { object | Array } node React-элемент или массив детей
 * @returns { object | Array } Дерево с новой кнопкой
 */
MuteAllChatPlugin.prototype.addPopoutMuteButton = function (node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.map((child) => this.addPopoutMuteButton(child));
  }
  if (!BdApi.React.isValidElement(node)) return node;

  const className = node.props?.className;
  if (
    typeof className === "string" &&
    className.includes("verticalStackedButtons")
  ) {
    const children = BdApi.React.Children.toArray(node.props.children);
    const sample = children.find((child) => BdApi.React.isValidElement(child));
    if (
      !sample ||
      children.some(
        (child) =>
          child?.props?.key === "mute-all-chat-popout" ||
          child?.key === "mute-all-chat-popout",
      )
    ) {
      return node;
    }
    const { children: _children, ...rest } = node.props;
    return BdApi.React.cloneElement(
      node,
      rest,
      ...children,
      this.makePopoutMuteButton(sample),
    );
  }

  const children = node.props?.children;
  if (children == null) return node;
  const next = this.addPopoutMuteButton(children);
  if (next === children) return node;
  const { children: _children, ...rest } = node.props;
  return BdApi.React.cloneElement(node, rest, next);
};

/**
 * Дополняет уже собранный поповер профиля.
 * Возврат подменяет дерево, которое нарисовал Discord.
 * Вызывается на рендер после открытия, не в момент загрузки плагина.
 * @param { object } props Пропсы компонента, который рисует ряд кнопок
 * @param { object } popout React-элемент этого компонента
 * @returns { object } Элемент, который будет показан
 */
MuteAllChatPlugin.prototype.onUserPopout = function (props, popout) {
  return this.addPopoutMuteButton(popout);
};
