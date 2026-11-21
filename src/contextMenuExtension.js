/**
 * Метод, который модифицирует контекстное меню (ПКМ по пользователю) юзеры.
 */
MuteAllChatPlugin.prototype.modifyContextMenu = function () {
  /**
   * Ищет определенный элменет с указанным id у детей node
   * @param { object | Array } node Элемент меню или массив детей
   * @param { string } id Идентификатор искомого элемента
   * @returns { object | null } Найденный элемент. Возвращает null, если он не найден
   */
  function findItem(node, id) {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findItem(child, id);
        if (found) return found;
      }
      return null;
    }
    if (node.props?.id === id) return node;
    return findItem(node.props?.children, id);
  }

  this.unpatchMenu = BdApi.ContextMenu.patch("user-context", (menu, props) => {
    const userId = props.user?.id;
    if (!userId || userId == this.currentUserId) return;
    const muteItem = findItem(menu.props.children, "mute");
    const sliderItem = findItem(menu.props.children, "user-volume");
    if (!muteItem) return;

    const pluginSectionSeparator = BdApi.React.createElement(
      BdApi.ContextMenu.Separator,
    );

    const [on, setOn] = BdApi.React.useState(
      () => this.ensureUser(userId).muted === true,
    );
    // Кастомный чекбокс, которым можно отметить
    // пользователя, как модерируемого со стороны плагина
    const customSwitch = BdApi.React.createElement(muteItem.type, {
      ...muteItem.props,
      id: "mute-all-chat-mute",
      label: "MuteAllChat: Mute",
      checked: on,
      action: () => {
        const next = !this.ensureUser(userId).muted;
        this.ensureUser(userId).muted = next;
        setOn(next);
        if (next) {
          duckSetOn(false);
          this.ensureUser(userId).ducked = false;
        }
        this.saveConfig();
        this.syncGameMutes();
      },
    });

    const [duckOn, duckSetOn] = BdApi.React.useState(
      () => this.ensureUser(userId).ducked === true,
    );
    const customDuckSwitch = BdApi.React.createElement(muteItem.type, {
      ...muteItem.props,
      id: "mute-all-chat-duck",
      label: "MuteAllChat: Duck",
      checked: duckOn,
      action: () => {
        const next = !this.ensureUser(userId).ducked;
        this.ensureUser(userId).ducked = next;
        duckSetOn(next);
        if (next) {
          setOn(false);
          this.ensureUser(userId).muted = false;
        }
        this.saveConfig();
        this.syncGameMutes();
      },
    });

    const originalControl = sliderItem.props.control;
    sliderItem.props.control = (controlProps, ref) => {
      const element = originalControl(controlProps, ref);
      if (!element) return element;
      return BdApi.React.cloneElement(element, {
        onChange: (value) => {
          const volume = this.asVolume(value);
          if (volume == null) return;
          this.applyLocalVolume(userId, volume);
        },
      });
    };

    const customSlider = BdApi.React.createElement(sliderItem.type, {
      ...sliderItem.props,
      id: "mute-all-chat-user-volume",
      label: "MuteAllChat: Volume",
      control: (controlProps, ref) => {
        const slider = originalControl(controlProps, ref);
        const duckVolume = this.getDuckedVolume(userId);
        return BdApi.React.cloneElement(slider, {
          value: duckVolume,
          onChange: (value) => {
            const volume = this.asVolume(value);
            if (volume == null) return;
            this.ensureUser(userId).duckVolume = volume;
            this.saveConfig();
          },
        });
      },
    });

    const children = Array.isArray(menu.props.children)
      ? menu.props.children
      : [menu.props.children];
    menu.props.children = [
      ...children,
      pluginSectionSeparator,
      customSwitch,
      customDuckSwitch,
      customSlider,
    ];
  });
};
