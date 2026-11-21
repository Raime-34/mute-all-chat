---
name: add-context-checkbox
description: >-
  Adds a checkbox to the MuteAllChat user context menu by cloning the existing
  switch in src/contextMenuExtension.js. Use when the user asks to add a
  checkbox, switch, toggle, галочку, or пункт в контекстное меню этого плагина.
---

# Чекбокс в контекстном меню

Правки меню — в `src/contextMenuExtension.js`, внутри патча `"user-context"`. Готовый образец — `customSwitch` (Mute). `customDuckSwitch` смотри, только если новый пункт должен выключать другой.

Меню трогай только там. В `src/utils.js` и `src/mute.js` лезь, если галочка должна влиять на мут или громкость. Сборку не запускай: пользователь собирает сам.

## Как добавить

1. Скопируй `customSwitch`. Клонируй `muteItem.type` и разверни `muteItem.props`.
2. Свой `id`: `mute-all-chat-<имя>`. Одинаковый id подсвечивает оба пункта при наведении.
3. Подпись: `MuteAllChat: <Name>`.
4. Свой `useState`. Все `useState` стоят подряд после `if (!muteItem) return`. В `action` и `control` хуки не вызывай.
5. Начальное значение: `() => this.ensureUser(userId).<поле> === true`.
6. В `action` переключи поле, вызови setter и `this.saveConfig()`. `this.syncGameMutes()` — только если галочка должна сработать сразу.
7. Вставь элемент в `menu.props.children` после уже существующего разделителя. Второй разделитель не добавляй.

Новое поле можно не инициализировать. `ensureUser` создаёт `{ muted: false }`, отсутствующее поле проверяется через `=== true`, как `ducked`. `ensureUser` не переписывай, если не нужен другой дефолт.

Чужие описания не трогай. Новый метод на прототипе опиши коротко по-русски, как соседние: первая фраза, затем `@param { type } name` и `@returns { type }`, пробелы внутри скобок.

## Образец

```javascript
const [on, setOn] = BdApi.React.useState(
  () => this.ensureUser(userId).muted === true,
);
const customSwitch = BdApi.React.createElement(muteItem.type, {
  ...muteItem.props,
  id: "mute-all-chat-mute",
  label: "MuteAllChat: Mute",
  checked: on,
  action: () => {
    const next = !this.ensureUser(userId).muted;
    this.ensureUser(userId).muted = next;
    setOn(next);
    this.saveConfig();
    this.syncGameMutes();
  },
});
```

Взаимное выключение Mute и Duck не копируй, если пользователь этого не просил.

## Если галочка должна что-то делать

Рядом с `isMarkedForDuck` в `src/utils.js` добавь проверку в том же виде. Поведение — в `syncGameMutes` в `src/mute.js`. Сначала прочитай текущий цикл и впишись в него, не дублируй ветки мута и приглушения.
