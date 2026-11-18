build:
	copy /Y /B index.plugin.js+base.js+contextMenuExtension.js+userPopout.js+activity.js+mute.js+utils.js+config.js MuteAllChat.plugin.js
	copy /Y MuteAllChat.plugin.js "$(APPDATA)\BetterDiscord\plugins"
	del /Q MuteAllChat.plugin.js