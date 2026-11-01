# Shared storage rule: project-specific runtimes and caches belong to this repo.
$script:TrozyProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
function Assert-TrozyProjectDirectory([string]$Directory) {
  if (-not [IO.Path]::IsPathRooted($Directory)) { $Directory = Join-Path $script:TrozyProjectRoot $Directory }
  $resolved = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
  if (-not $resolved.StartsWith($script:TrozyProjectRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Project runtimes, models, caches and temporary files must stay inside the Trozy project directory.' }
  $ancestor = $resolved
  while ($ancestor -ne $script:TrozyProjectRoot) {
    if (Test-Path -LiteralPath $ancestor) {
      $item=Get-Item -LiteralPath $ancestor -Force
      # OneDrive cloud placeholders also have ReparsePoint but do not redirect
      # paths. Reject actual namespace links/junctions, not cloud attributes.
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and ($item.LinkType -or @($item.Target | Where-Object { $_ }).Count)) { throw 'Project runtime paths must not traverse symbolic links or junctions.' }
    }
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
  }
  return $resolved
}
