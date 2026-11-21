build:
	copy /Y /B src\index.plugin.js+src\base.js+src\contextMenuExtension.js+src\userPopout.js+src\activity.js+src\mute.js+src\utils.js+src\config.js MuteAllChat.plugin.js
	copy /Y MuteAllChat.plugin.js "$(APPDATA)\BetterDiscord\plugins"
	del /Q MuteAllChat.plugin.js