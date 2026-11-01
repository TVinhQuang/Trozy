param([string]$Output='docs/test/visionstate-yolo-20261031/baseline',[switch]$Controls,[switch]$OrientationDiagnostics,[switch]$Refinement)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskDirectory=Join-Path $projectRoot ('tmp\visionstate-yolo-run-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskDirectory | Out-Null
$runtimeRoot=Join-Path $projectRoot '.runtime\meter-digits\visionstate-yolo'
$env:TEMP=$taskDirectory;$env:TMP=$taskDirectory;$env:TMPDIR=$taskDirectory
$env:PYTHONDONTWRITEBYTECODE='1';$env:PYTHONNOUSERSITE='1'
$env:YOLO_CONFIG_DIR=Join-Path $runtimeRoot 'ultralytics-config'
$env:MPLCONFIGDIR=Join-Path $runtimeRoot 'matplotlib'
$env:TORCH_HOME=Join-Path $runtimeRoot 'torch-cache'
$env:HF_HOME=Join-Path $runtimeRoot 'huggingface-cache'
$env:YOLO_AUTOINSTALL='false';$env:YOLO_OFFLINE='true'
$scriptFile='run_trial.py'
if($Refinement){
 $scriptFile='refine_trial.py'
 if(-not $PSBoundParameters.ContainsKey('Output')){$Output='docs/test/visionstate-yolo-20261031/geometry-refinement'}
 if($Controls -or $OrientationDiagnostics){throw 'Refinement reuses frozen baseline cases and controls.'}
}
$arguments=@('-B',(Join-Path $PSScriptRoot $scriptFile),'--output',$Output)
if($Controls){$arguments+='--controls'}
if($OrientationDiagnostics){$arguments+='--orientation-diagnostics'}
try{
 & (Join-Path $runtimeRoot 'python\python.exe') @arguments
 if($LASTEXITCODE -ne 0){throw 'Offline trial failed; inspect output and keep earlier trial reports.'}
}finally{
 $resolved=(Resolve-Path -LiteralPath $taskDirectory).Path
 if($resolved -eq $taskDirectory -and [IO.Path]::GetDirectoryName($resolved) -eq (Join-Path $projectRoot 'tmp') -and -not ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){
  $redirects=Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1
  if(-not $redirects){Remove-Item -LiteralPath $resolved -Recurse -Force}
 }
}
