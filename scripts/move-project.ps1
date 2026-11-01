param(
  [string]$SourceRoot = (Join-Path $PSScriptRoot '..'),
  [string]$Destination = 'D:\Trozy',
  [switch]$PlanOnly,
  [switch]$KeepSource,
  [switch]$Finalize
)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\')
$target = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
if ($source -eq [IO.Path]::GetPathRoot($source).TrimEnd('\') -or $target -ne 'D:\Trozy') { throw 'Use the dedicated authorized destination D:\Trozy and a project source directory.' }
if ($source -eq $target -or $target.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase) -or $source.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'The source and destination must be separate directories.' }
if ($KeepSource -and $Finalize) { throw 'KeepSource and Finalize cannot be combined.' }
$manifestFile = Join-Path $source 'package.json'
if (-not (Test-Path -LiteralPath $manifestFile) -or (Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json).name -ne 'trozy') { throw 'SourceRoot must be the existing Trozy project.' }
if ($Finalize) {
  if (-not (Test-Path -LiteralPath (Join-Path $target 'package.json'))) { throw 'Finalize requires the already-copied destination project.' }
} elseif (Test-Path -LiteralPath $target) { throw 'The destination already exists. Nothing was overwritten; use Finalize only after completing verification.' }

function Assert-NoRedirects([string]$Directory) {
  if (-not (Test-Path -LiteralPath $Directory)) { return }
  foreach($item in @((Get-Item -LiteralPath $Directory -Force)) + @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)) {
    # Cloud placeholders in OneDrive retain their actual location; reject real
    # symbolic links/junctions that could escape either project directory.
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and ($item.LinkType -or @($item.Target | Where-Object { $_ }).Count)) { throw "Symbolic links/junctions are not copied or removed: $($item.FullName)" }
  }
}

function Get-SourceInventory {
  $prefix=$source+'\'
  return ,@(Get-ChildItem -LiteralPath $source -Recurse -Force -File | Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{Path=$_.FullName.Substring($prefix.Length);Bytes=$_.Length;Hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
  })
}

function Assert-CopiedFiles($Inventory) {
  foreach($entry in $Inventory) {
    $file=Join-Path $target $entry.Path
    if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file -Force).Length -ne $entry.Bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -cne $entry.Hash) { throw "Destination verification failed: $($entry.Path). Source was retained." }
  }
}

Assert-NoRedirects $source
Assert-NoRedirects $target
$files = @(Get-ChildItem -LiteralPath $source -Recurse -Force -File)
$requiredBytes = [long]($files | Measure-Object -Property Length -Sum).Sum
$drive = New-Object System.IO.DriveInfo([IO.Path]::GetPathRoot($target))
if ($PlanOnly) {
  [pscustomobject]@{Source=$source;Destination=$target;Files=$files.Count;RequiredCopyBytes=$(if($Finalize){0}else{$requiredBytes});AvailableBytes=$drive.TotalFreeSpace;ReserveBytes=128MB;EnoughSpace=($Finalize -or $drive.TotalFreeSpace -ge ($requiredBytes+128MB));SourceWillBeRemoved=[bool]$Finalize;PreservesGitAndDependencies=$true;WritesPerformed=$false} | ConvertTo-Json
  return
}
if (-not $Finalize -and $drive.TotalFreeSpace -lt ($requiredBytes+128MB)) { throw 'The destination drive has insufficient space. Nothing was copied or removed.' }

Write-Output "Hashing every source file, including .git, dependencies, photos and application data: $source"
$before = Get-SourceInventory
if (-not $Finalize) {
  Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
}
Assert-NoRedirects $target
Assert-CopiedFiles $before
$after = Get-SourceInventory
if ($before.Count -ne $after.Count) { throw 'Source changed during verification. Source was retained.' }
for($index=0;$index -lt $before.Count;$index++) {
  if ($before[$index].Path -cne $after[$index].Path -or $before[$index].Bytes -ne $after[$index].Bytes -or $before[$index].Hash -cne $after[$index].Hash) { throw "Source changed during verification: $($before[$index].Path). Source was retained." }
}
if ($Finalize) {
  # Finalize allows additional model/cache/report files at D:, but requires
  # every original source file to have an identical destination counterpart.
  if ([IO.Path]::GetFullPath($source).TrimEnd('\') -ne $source -or $source -eq [IO.Path]::GetPathRoot($source).TrimEnd('\') -or [IO.Path]::GetFullPath($target).TrimEnd('\') -ne 'D:\Trozy') { throw 'Final resolved directories are unsafe for removal.' }
  Assert-NoRedirects $source
  Remove-Item -LiteralPath $source -Recurse -Force
  Write-Output "Finalized project move to $target; all $($before.Count) source files were verified before removing the original."
} else {
  Write-Output "Copied and verified $($before.Count) files / $requiredBytes bytes at $target. Original retained at $source. Run real model/tests at the destination, sync any later edits, then use -Finalize for the final verified removal."
}
