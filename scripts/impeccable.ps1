param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CommandArgs)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $projectRoot 'skills\impeccable\scripts\impeccable.cmd'
$taskTemp = Join-Path $projectRoot ('tmp\impeccable-' + [guid]::NewGuid().ToString('N'))
$oldTemp = $env:TEMP
$oldTmp = $env:TMP
$oldCache = $env:IMPECCABLE_HOME
New-Item -ItemType Directory -Path $taskTemp -Force | Out-Null
try {
    $env:IMPECCABLE_HOME = Join-Path $projectRoot '.cache\impeccable'
    $env:TEMP = $taskTemp
    $env:TMP = $taskTemp
    Push-Location -LiteralPath $projectRoot
    try { & $launcher @CommandArgs; $result = $LASTEXITCODE }
    finally { Pop-Location }
} finally {
    $env:TEMP = $oldTemp
    $env:TMP = $oldTmp
    $env:IMPECCABLE_HOME = $oldCache
    $resolvedTemp = (Resolve-Path -LiteralPath $taskTemp).Path
    $expectedTemp = [IO.Path]::GetFullPath($taskTemp)
    $tempRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'tmp')) + [IO.Path]::DirectorySeparatorChar
    if ($resolvedTemp -ne $expectedTemp -or !$resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing cleanup outside this Impeccable task directory.'
    }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
}
exit $result
