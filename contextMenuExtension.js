/**
 * Метод, который модифицирует контекстное меню (ПКМ по пользователю) юзеры.
 */
MuteAllChatPlugin.prototype.modifyContextMenu = function () {
  const Slider = BdApi.Webpack.getModule(
    (exp) =>
      typeof exp === "function" &&
      exp.toString().includes("minValue") &&
      exp.toString().includes("maxValue"),
    { searchExports: true },
  );

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
    if (!Slider || !userId || userId == this.currentUserId) return;
    // const volumeItem = findItem(menu.props.children, "user-volume");
    const muteItem = findItem(menu.props.children, "mute");
    if (!muteItem) return;

    // const customeSlider = BdApi.React.createElement(volumeItem.type, {
    //   ...volumeItem.props,
    //   id: "mute-all-chat-regular-volume",
    //   label: "Regular volume",
    //   control: (sliderProps, ref) =>
    //     BdApi.React.createElement(Slider, {
    //       ...sliderProps,
    //       ref,
    //       minValue: 0,
    //       maxValue: 200,
    //       min: 0,
    //       max: 200,
    //       onChange: (next) => {
    //         console.log(next);
    //       },
    //       onValueChange: (next) => console.log(next),
    //       onValueRender: (value) => `${Math.round(value)}%`,
    //     }),
    // });

    const [on, setOn] = BdApi.React.useState(
      () => this.ensureUser(userId).muted === true,
    );
    // Кастомный чекбокс, которым можно отметить
    // пользователя, как модерируемого со стороны плагина
    const customSwitch = BdApi.React.createElement(muteItem.type, {
      ...muteItem.props,
      id: "mute-all-chat-mute",
      label: "Mute",
      checked: on,
      action: () => {
        const next = !this.ensureUser(userId).muted;
        this.ensureUser(userId).muted = next;
        setOn(next);
        this.saveConfig();
        console.log(
          "[MuteAllChat] checkbox",
          userId,
          next,
          this.config.users[userId],
        );
        this.syncGameMutes();
      },
    });

    const children = Array.isArray(menu.props.children)
      ? menu.props.children
      : [menu.props.children];
    menu.props.children = [...children, customSwitch];
  });
};
