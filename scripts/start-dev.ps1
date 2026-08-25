$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ViteMarker = Join-Path $ProjectRoot 'node_modules'
$connection = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if ($connection) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"
    $runningApp = Get-Process bookreader -ErrorAction SilentlyContinue
    $belongsToProject = $owner.Name -eq 'node.exe' -and $owner.CommandLine -like "*$ViteMarker*" -and $owner.CommandLine -like '*vite*'

    if ($belongsToProject -and $runningApp) {
        Write-Host 'BookReader 已经在运行，请查看任务栏中的应用窗口。' -ForegroundColor Yellow
        exit 0
    }

    if ($belongsToProject) {
        Write-Host '检测到 BookReader 遗留的开发服务器，正在安全关闭…' -ForegroundColor Yellow
        Stop-Process -Id $connection.OwningProcess -Force
        Start-Sleep -Milliseconds 300
    }
    else {
        Write-Host "端口 1420 正被其他程序占用（PID $($connection.OwningProcess)），BookReader 无法启动。" -ForegroundColor Red
        exit 1
    }
}

Set-Location -LiteralPath $ProjectRoot
Write-Host '正在启动 BookReader 开发版。请保持此窗口开启。' -ForegroundColor Green
npm run tauri dev
