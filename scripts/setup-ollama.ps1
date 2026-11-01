param(
  [string]$InstallRoot = (Join-Path $PSScriptRoot '..\.runtime\ollama'),
  [string]$Model = 'qwen3:4b-instruct',
  [string]$Version = 'v0.40.11',
  [switch]$SkipPull
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'project-paths.ps1')
$savedLocation = Join-Path $PSScriptRoot '..\.cache\ollama-location.json'
if (-not $PSBoundParameters.ContainsKey('InstallRoot') -and (Test-Path -LiteralPath $savedLocation)) {
  $savedRuntime = Get-Content -LiteralPath $savedLocation -Raw -Encoding UTF8 | ConvertFrom-Json
  # The saved model names remain useful after moving the repo. Runtime paths
  # are resolved from this repo, so an old external-drive manifest is ignored.
  if (-not $PSBoundParameters.ContainsKey('Model') -and $savedRuntime.model) { $Model = $savedRuntime.model }
}
foreach ($localModel in @($Model)) {
  if ($localModel -notmatch '^[a-zA-Z0-9._:/-]{1,120}$' -or $localModel -match '(?i)(^|[-:])cloud($|[-:])') { throw 'Choose a valid downloaded local model, not a cloud tag.' }
}
$runtimeRoot = Assert-TrozyProjectDirectory $InstallRoot
$runtimeDirectory = Join-Path $runtimeRoot 'runtime'
$modelDirectory = Join-Path $runtimeRoot 'models'
$temporaryDirectory = Join-Path $runtimeRoot 'tmp'
$profileDirectory = Join-Path $runtimeRoot 'profile'
$executable = Join-Path $runtimeDirectory 'ollama.exe'
if ($SkipPull -and -not (Test-Path -LiteralPath $executable)) { throw 'The prepared project Ollama runtime is missing. Migrate the existing runtime or run npm run ai:setup first; ai:start does not download files.' }
New-Item -ItemType Directory -Path $runtimeDirectory,$modelDirectory,$temporaryDirectory,$profileDirectory,(Join-Path $profileDirectory 'AppData\Local'),(Join-Path $profileDirectory 'AppData\Roaming') -Force | Out-Null
$env:TEMP = $temporaryDirectory
$env:TMP = $temporaryDirectory
$env:TMPDIR = $temporaryDirectory
$env:OLLAMA_TMPDIR = $temporaryDirectory
$releaseUrl = "https://github.com/ollama/ollama/releases/download/$Version"
if (-not (Test-Path -LiteralPath $executable)) {
  $archive = Join-Path $runtimeRoot 'ollama-windows-amd64.zip'
  $createdArchive = -not (Test-Path -LiteralPath $archive)
  try {
  $checksumResponse = (Invoke-WebRequest -UseBasicParsing -Uri "$releaseUrl/sha256sum.txt").Content
  $checksums = if ($checksumResponse -is [byte[]]) { [Text.Encoding]::UTF8.GetString($checksumResponse) } else { [string]$checksumResponse }
  $checksumLine = ($checksums -split "`n" | Where-Object { $_ -match '\s\*?(\./)?ollama-windows-amd64\.zip\s*$' } | Select-Object -First 1)
  if (-not $checksumLine -or $checksumLine -notmatch '^([a-fA-F0-9]{64})\s') { throw 'Official release checksum was not found.' }
  $expectedHash = $Matches[1]
  Write-Output "Downloading official Ollama $Version to $runtimeRoot"
  if ($createdArchive) {
    & curl.exe --fail --location --retry 2 --silent --show-error --output $archive "$releaseUrl/ollama-windows-amd64.zip"
    if ($LASTEXITCODE -ne 0) { throw 'Ollama download failed.' }
  }
  $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if ($actualHash -ne $expectedHash) { throw 'Ollama archive checksum does not match. No executable was started.' }
  Write-Output 'Checksum verified. Extracting portable runtime.'
  Expand-Archive -LiteralPath $archive -DestinationPath $runtimeDirectory -Force
  }
  finally {
    if ($createdArchive -and [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($archive)) -eq $runtimeRoot -and [IO.Path]::GetFileName($archive) -eq 'ollama-windows-amd64.zip') { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
  }
}
$env:OLLAMA_MODELS = $modelDirectory
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
$existingServer=$null
try { $existingServer = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 } catch {}
if ($existingServer) {
  $pidFile=Join-Path $runtimeRoot 'server.pid'
  $managedProcess=$null
  if (Test-Path -LiteralPath $pidFile) {
    $managedProcessId=0
    if ([int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(),[ref]$managedProcessId)) { $managedProcess=Get-Process -Id $managedProcessId -ErrorAction SilentlyContinue }
  }
  if (-not $managedProcess -or -not $managedProcess.Path -or [IO.Path]::GetFullPath($managedProcess.Path) -ne [IO.Path]::GetFullPath($executable)) { throw 'An Ollama server is already running outside this project runtime, or its identity cannot be verified. Stop it before preparing project models. No models were pulled.' }
} else {
  $savedProfile = @{USERPROFILE=$env:USERPROFILE;LOCALAPPDATA=$env:LOCALAPPDATA;APPDATA=$env:APPDATA}
  try {
    $env:USERPROFILE=$profileDirectory
    $env:LOCALAPPDATA=Join-Path $profileDirectory 'AppData\Local'
    $env:APPDATA=Join-Path $profileDirectory 'AppData\Roaming'
    $process = Start-Process -FilePath $executable -ArgumentList 'serve' -WorkingDirectory $runtimeRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'server.log') -RedirectStandardError (Join-Path $runtimeRoot 'server-error.log')
  } finally {
    foreach($key in $savedProfile.Keys){[Environment]::SetEnvironmentVariable($key,$savedProfile[$key],'Process')}
  }
  Set-Content -LiteralPath (Join-Path $runtimeRoot 'server.pid') -Value $process.Id -Encoding ASCII
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2; $ready=$true; break } catch { Start-Sleep -Milliseconds 400 }
  }
  if (-not $ready) { throw "Ollama did not start; inspect $runtimeRoot\server-error.log" }
}
if (-not $SkipPull) {
  $modelsToPull = @($Model)
  foreach ($localModel in $modelsToPull) {
    Write-Output "Preparing downloaded local model $localModel (one-time download if missing)."
    $pullBody = @{model=$localModel;stream=$false} | ConvertTo-Json -Compress
    $result = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/pull' -Method POST -ContentType 'application/json' -Body $pullBody -TimeoutSec 1800
    if ($result.status -ne 'success') { throw 'Model download did not complete.' }
  }
}
$locationFile = Join-Path $PSScriptRoot '..\.cache\ollama-location.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $locationFile) -Force | Out-Null
@{installRoot=$runtimeRoot;executable=$executable;models=$modelDirectory;model=$Model;host='http://127.0.0.1:11434';version=$Version} | ConvertTo-Json | Set-Content -LiteralPath $locationFile -Encoding UTF8
Write-Output "Ollama is ready on http://127.0.0.1:11434; model $Model; files stay in $runtimeRoot."
