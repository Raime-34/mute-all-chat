build:
	copy /Y /B index.plugin.js+base.js+contextMenuExtension.js+activity.js+config.js MuteAllChat.plugin.js
	copy /Y MuteAllChat.plugin.js "$(APPDATA)\BetterDiscord\plugins"