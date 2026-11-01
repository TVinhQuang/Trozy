param([string]$ProjectRoot = (Join-Path $PSScriptRoot '..'),[switch]$PlanOnly)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
$projectManifest = Join-Path $repositoryRoot 'package.json'
if (-not (Test-Path -LiteralPath $projectManifest) -or (Get-Content -LiteralPath $projectManifest -Raw -Encoding UTF8 | ConvertFrom-Json).name -ne 'trozy') { throw 'ProjectRoot must be the existing Trozy project directory.' }
$runtimeDirectory = Join-Path $repositoryRoot '.runtime'
$migrations = @(
  @{Source='D:\TrozyLocalAI'; Destination=(Join-Path $runtimeDirectory 'ollama')}
)

function Assert-PlainDirectory([string]$Directory) {
  $resolved = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
  if ($resolved -eq [IO.Path]::GetPathRoot($resolved).TrimEnd('\')) { throw 'A drive root cannot be migrated.' }
  if (Test-Path -LiteralPath $resolved) {
    $item = Get-Item -LiteralPath $resolved -Force
    if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and ($item.LinkType -or @($item.Target | Where-Object { $_ }).Count))) { throw "Not an ordinary directory: $resolved" }
    # OneDrive cloud placeholders are not path redirects; symlinks/junctions are.
    if (Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and ($_.LinkType -or @($_.Target | Where-Object { $_ }).Count) } | Select-Object -First 1) { throw "Symbolic links/junctions are not migrated: $resolved" }
  }
}

function Get-Inventory([string]$Directory) {
  $prefix = [IO.Path]::GetFullPath($Directory).TrimEnd('\') + '\'
  $items = @(Get-ChildItem -LiteralPath $Directory -Recurse -Force -File | Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{Path=$_.FullName.Substring($prefix.Length); Bytes=$_.Length; Hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
  })
  return ,$items
}

function Assert-SameInventory($Expected,$Actual,[string]$Label) {
  if ($Expected.Count -ne $Actual.Count) { throw "File count changed: $Label" }
  for ($index=0; $index -lt $Expected.Count; $index++) {
    if ($Expected[$index].Path -cne $Actual[$index].Path -or $Expected[$index].Bytes -ne $Actual[$index].Bytes -or $Expected[$index].Hash -cne $Actual[$index].Hash) { throw "File verification failed: $Label / $($Expected[$index].Path)" }
  }
}

# Only the two explicitly identified, dedicated Trozy directories may be removed.
foreach ($migration in $migrations) {
  if ([IO.Path]::GetFullPath($migration.Source) -ne 'D:\TrozyLocalAI') { throw 'Unexpected legacy directory.' }
  $destination = [IO.Path]::GetFullPath($migration.Destination)
  if (-not $destination.StartsWith($repositoryRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($destination) -ne $runtimeDirectory) { throw 'Destination escapes the project runtime directory.' }
  Assert-PlainDirectory $migration.Source
  Assert-PlainDirectory $migration.Destination
}
Assert-PlainDirectory $runtimeDirectory

# Check space before creating any destination or starting a large cross-volume copy.
$requiredBytes = [long]0
foreach ($migration in $migrations) {
  if (Test-Path -LiteralPath $migration.Source) {
    $sourceBytes = [long](Get-ChildItem -LiteralPath $migration.Source -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
    $existingBytes = [long]0
    if (Test-Path -LiteralPath $migration.Destination) { $existingBytes = [long](Get-ChildItem -LiteralPath $migration.Destination -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum }
    $requiredBytes += [Math]::Max([long]0,$sourceBytes-$existingBytes)
  }
}
$destinationDrive = New-Object System.IO.DriveInfo([IO.Path]::GetPathRoot($repositoryRoot))
if ($PlanOnly) {
  [pscustomobject]@{ProjectRoot=$repositoryRoot;Migrations=$migrations;RequiredCopyBytes=$requiredBytes;AvailableBytes=$destinationDrive.TotalFreeSpace;ReserveBytes=128MB;EnoughSpace=($destinationDrive.TotalFreeSpace -ge ($requiredBytes + 128MB));WritesPerformed=$false} | ConvertTo-Json -Depth 5
  return
}
if ($destinationDrive.TotalFreeSpace -lt ($requiredBytes + 128MB)) { throw "Insufficient space in project drive: need $requiredBytes bytes plus 128 MiB reserve; available $($destinationDrive.TotalFreeSpace). No files were copied or removed." }

# A running model/python process can change its files while they are copied.
foreach ($taskProcess in @(Get-Process -Name 'ollama*','python*' -ErrorAction SilentlyContinue)) {
  if (-not $taskProcess.Path) { throw 'Cannot identify a running AI process. Stop the project AI runtime before migrating.' }
  foreach ($migration in $migrations) {
    if ([IO.Path]::GetFullPath($taskProcess.Path).StartsWith($migration.Source+'\',[StringComparison]::OrdinalIgnoreCase)) { throw "Stop the project runtime before migration: $($taskProcess.Path)" }
  }
}
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

foreach ($migration in $migrations) {
  $source = [IO.Path]::GetFullPath($migration.Source)
  $destination = [IO.Path]::GetFullPath($migration.Destination)
  if (-not (Test-Path -LiteralPath $source)) {
    if (-not (Test-Path -LiteralPath $destination)) { throw "Neither source nor destination exists: $source" }
    Write-Output "Already migrated: $destination"
    continue
  }
  Write-Output "Hashing project runtime: $source"
  $before = Get-Inventory $source
  if (-not (Test-Path -LiteralPath $destination)) {
    # Copy across volumes, then verify before deleting any original. Directory
    # Move-Item across drives is not supported consistently in Windows PowerShell.
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
  } elseif (-not (Get-ChildItem -LiteralPath $destination -Recurse -Force -File | Select-Object -First 1)) {
    # Empty scaffolding from a setup attempt is safe to populate. Do not nest
    # the source directory inside an existing destination.
    foreach($child in @(Get-ChildItem -LiteralPath $source -Force)) { Copy-Item -LiteralPath $child.FullName -Destination $destination -Recurse }
  }
  Assert-SameInventory $before (Get-Inventory $destination) $destination
  Assert-SameInventory $before (Get-Inventory $source) $source
  Assert-PlainDirectory $source
  Assert-PlainDirectory $destination
  if ($source -ne 'D:\TrozyLocalAI') { throw 'Refusing removal outside the exact legacy project directory.' }
  # Originals are deleted only after every copied file has the same SHA256 and
  # the source has been rechecked. Failure before this point retains originals.
  Remove-Item -LiteralPath $source -Recurse -Force
  $total = ($before | Measure-Object -Property Bytes -Sum).Sum
  Write-Output "Migrated and verified: $destination ($($before.Count) files, $total bytes)"
}

$ollamaRoot = Join-Path $runtimeDirectory 'ollama'
$manifestFile = Join-Path $repositoryRoot '.cache\ollama-location.json'
if (Test-Path -LiteralPath $manifestFile) {
  $manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $manifest.installRoot = $ollamaRoot
  $manifest.executable = Join-Path $ollamaRoot 'runtime\ollama.exe'
  $manifest.models = Join-Path $ollamaRoot 'models'
  $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestFile -Encoding UTF8
}
Write-Output 'Project runtimes are local. Existing models were reused; nothing was downloaded.'
