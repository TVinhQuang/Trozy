$ErrorActionPreference='Stop'
$locationFile=Join-Path $PSScriptRoot '..\.cache\ollama-location.json'
if(-not(Test-Path -LiteralPath $locationFile)){Write-Output 'No Trozy-managed Ollama runtime was recorded.';exit 0}
$runtime=Get-Content -LiteralPath $locationFile -Raw -Encoding UTF8 | ConvertFrom-Json
$pidFile=Join-Path $runtime.installRoot 'server.pid'
if(-not(Test-Path -LiteralPath $pidFile)){Write-Output 'No Trozy-managed Ollama process was recorded.';exit 0}
$taskProcessId=[int](Get-Content -LiteralPath $pidFile -Raw).Trim()
$taskProcess=Get-Process -Id $taskProcessId -ErrorAction SilentlyContinue
if(-not $taskProcess){Write-Output 'The recorded Ollama process has already stopped.';exit 0}
if(-not $taskProcess.Path -or [IO.Path]::GetFullPath($taskProcess.Path) -ne [IO.Path]::GetFullPath($runtime.executable)){throw 'The recorded process does not match the Trozy runtime. Nothing was stopped.'}
Stop-Process -Id $taskProcessId
Write-Output 'Stopped the Trozy-managed Ollama runtime. Use npm run ai:start to start it again.'
