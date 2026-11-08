# Run Post Studio in the background

Keep Post Studio running without an open terminal: it starts automatically and restarts if it crashes. Pick your OS below, or use the cross-platform [pm2](#any-os-pm2) option.

All setups share these points:

- **Pick an unused port.** The default is `4173`, which is also Vite's preview port. Set the `PORT` environment variable (examples use `38417`). The server binds to `127.0.0.1` only.
- **Run `server.mjs` directly** (`node server.mjs`), not `bin/post-studio.mjs start`. Under macOS launchd the launcher hung and never started the server.
- **`claude` must be on the service's PATH.** Post Studio shells out to the Claude Code CLI, and background services do not load your shell profile. Check with `which claude` (macOS/Linux) or `where claude` (Windows) and add that folder to the service's PATH.
- Logs and data live in `~/.post-studio` (`node bin/post-studio.mjs where`).

Check the port is free:

```bash
lsof -nP -iTCP:38417 -sTCP:LISTEN || echo free      # macOS / Linux
```
```powershell
Get-NetTCPConnection -LocalPort 38417 -State Listen -ErrorAction SilentlyContinue   # Windows (no output = free)
```

---

## macOS (launchd)

Save as `~/Library/LaunchAgents/com.poststudio.plist`. Replace `/path/to/post-studio` and `YOU`; find Node with `which node`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.poststudio</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/post-studio/server.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/post-studio</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/Users/YOU/.local/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>PORT</key><string>38417</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/.post-studio/server.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/.post-studio/server.err.log</string>
</dict>
</plist>
```

```bash
mkdir -p ~/.post-studio
launchctl load ~/Library/LaunchAgents/com.poststudio.plist
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:38417/    # expect 200
```

Manage:

```bash
launchctl unload ~/Library/LaunchAgents/com.poststudio.plist     # stop
launchctl load   ~/Library/LaunchAgents/com.poststudio.plist     # start
launchctl kickstart -k gui/$(id -u)/com.poststudio               # restart
tail -f ~/.post-studio/server.err.log                            # logs
```

Caveats: it runs only while you are logged in, and sleep pauses it (`caffeinate -s` or Energy settings). If it fails to start after a reboot and the project is in `~/Desktop` or `~/Documents`, macOS privacy protection may be blocking background processes; move the project to e.g. `~/Projects`.

---

## Linux (systemd user service)

Save as `~/.config/systemd/user/post-studio.service`. Replace `/path/to/post-studio`; find Node with `which node` (if you use nvm, use its full path, e.g. `~/.nvm/versions/node/vXX/bin/node`).

```ini
[Unit]
Description=Post Studio
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/post-studio/server.mjs
WorkingDirectory=/path/to/post-studio
Environment=PORT=38417
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

`%h` expands to your home directory. Output goes to the journal.

```bash
systemctl --user daemon-reload
systemctl --user enable --now post-studio
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:38417/    # expect 200
```

Manage:

```bash
systemctl --user stop post-studio
systemctl --user restart post-studio
systemctl --user status post-studio
journalctl --user -u post-studio -f                # logs
```

By default a user service stops when you log out and starts at login. To keep it running with no login (e.g. on a server), enable lingering once:

```bash
sudo loginctl enable-linger $USER
```

Claude Code must be installed and logged in as the same user.

---

## Windows (Task Scheduler)

Run in PowerShell (no admin needed). Replace `C:\path\to\post-studio`; find Node with `(Get-Command node).Source`.

```powershell
# 1. Port, stored as a user environment variable
[Environment]::SetEnvironmentVariable("PORT", "38417", "User")

# 2. Task: start at logon, restart on failure, no time limit
$action   = New-ScheduledTaskAction -Execute "node.exe" `
            -Argument "server.mjs" -WorkingDirectory "C:\path\to\post-studio"
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "PostStudio" -Action $action -Trigger $trigger -Settings $settings

# 3. Start now (new PORT value applies after you sign out/in, or pass it explicitly):
$env:PORT = "38417"; Start-ScheduledTask -TaskName "PostStudio"
```

Verify: `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:38417/` should print `200`.

Manage:

```powershell
Stop-ScheduledTask       -TaskName "PostStudio"      # stop
Start-ScheduledTask      -TaskName "PostStudio"      # start
Unregister-ScheduledTask -TaskName "PostStudio" -Confirm:$false   # remove
```

Notes:

- The task has no console window logging. For logs, run it via a wrapper: change `-Execute` to `cmd.exe` and `-Argument` to `/c node server.mjs >> "%USERPROFILE%\.post-studio\server.log" 2>&1`.
- `node` and `claude` must be on your user PATH (the task runs as you). Check with `where node` and `where claude`.
- It runs while you are signed in. Sleep pauses it; adjust Power settings if needed.

---

## Any OS: pm2

[pm2](https://pm2.keymetrics.io) is a Node process manager that works the same everywhere.

```bash
npm install -g pm2
cd /path/to/post-studio
PORT=38417 pm2 start server.mjs --name post-studio    # Windows PowerShell: $env:PORT=38417; pm2 start server.mjs --name post-studio
pm2 save
pm2 startup          # prints a command to run once so pm2 restarts on boot (Linux/macOS)
```

Manage: `pm2 status`, `pm2 logs post-studio`, `pm2 restart post-studio`, `pm2 stop post-studio`. On Windows, `pm2 startup` is not supported; use the Task Scheduler recipe above, or the `pm2-windows-startup` package.

---

## Always-on (24/7)

All the above run only while the machine is on. For true 24/7, host it on an always-on machine (a VPS or home server) with Node, Claude Code installed and logged in, and keep the port bound to localhost (reach it through an SSH tunnel or a reverse proxy with authentication rather than exposing it publicly).

## Quick alternative

`PORT=38417 nohup node server.mjs > /tmp/ps.log 2>&1 &` (macOS/Linux) survives closing the terminal but not a reboot or crash.
