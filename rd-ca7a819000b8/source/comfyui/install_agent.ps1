# Installs the Render Deck agent on this computer: it keeps ComfyUI running (starts it again after a crash or a
# reboot) and lets the phone app Start, Restart and Close ComfyUI. Run it once on each computer, in PowerShell:
#   iwr -useb https://raw.githubusercontent.com/jbrantner/jbrantner.github.io/main/rd-ca7a819000b8/source/comfyui/install_agent.ps1 -OutFile $env:TEMP\rd_agent.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\rd_agent.ps1
# Running it again updates the agent. Copyright (c) 2026 Jordan Brantner. All rights reserved.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'RenderDeck'
New-Item -ItemType Directory -Force $dir | Out-Null
$agent = Join-Path $dir 'render_deck_agent.py'
Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/jbrantner/jbrantner.github.io/main/rd-ca7a819000b8/source/comfyui/render_deck_agent.py' -OutFile $agent
Write-Host "Agent saved to $agent"

# Comfy Desktop's own Python runs it (pythonw: no window). The agent only uses Python's standard library.
$py = Get-ChildItem "$env:LOCALAPPDATA\Comfy-Desktop\ComfyUI-Installs\*\ComfyUI\.venv\Scripts\pythonw.exe", "$env:LOCALAPPDATA\Comfy-Desktop\ComfyUI-Installs\*\standalone-env\pythonw.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $py) { throw "Couldn't find Comfy Desktop's Python under $env:LOCALAPPDATA\Comfy-Desktop\ComfyUI-Installs" }
$py = $py.FullName
Write-Host "Python: $py"

# stop an older copy of the agent before starting this one
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" | Where-Object { $_.CommandLine -match 'render_deck_agent\.py' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# start it at every sign-in, and again if it ever stops
try {
  $action = New-ScheduledTaskAction -Execute $py -Argument "`"$agent`"" -WorkingDirectory $dir
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'Render Deck agent' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName 'Render Deck agent'
  Write-Host 'Starts at sign-in (Task Scheduler: Render Deck agent)'
} catch {
  # no permission for a scheduled task: a shortcut in the Startup folder does the same at sign-in
  $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Render Deck agent.lnk'
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = $py; $s.Arguments = "`"$agent`""; $s.WorkingDirectory = $dir; $s.Save()
  Start-Process -FilePath $py -ArgumentList "`"$agent`"" -WorkingDirectory $dir
  Write-Host 'Starts at sign-in (Startup folder shortcut)'
}

# let the app reach it through Tailscale, next to ComfyUI: https://<this computer>.ts.net/agent
$ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $ts) { $ts = 'C:\Program Files\Tailscale\tailscale.exe' }
& $ts serve --bg --set-path /agent http://127.0.0.1:8190 | Out-Null

Start-Sleep -Seconds 3
try { $st = Invoke-RestMethod http://127.0.0.1:8190/status; Write-Host "Agent is running. ComfyUI is $($st.comfy)." -ForegroundColor Green }
catch { Write-Host "The agent didn't answer yet; look at $dir\render_deck_agent.log" -ForegroundColor Yellow }
