' IM Task Sync - Electron launcher
' Close button -> minimize to tray
' Right-click tray -> Exit to quit
Set sh = CreateObject("WScript.Shell")
On Error Resume Next
sh.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0
sh.Run "{{ELECTRON_EXE_PATH}} {{APP_DIR}}", 1, False
Set sh = Nothing
