$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskDirectory=Join-Path $projectRoot ('tmp\setup-meter-reader-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
$savedEnvironment=@{}
foreach($key in @('TEMP','TMP','TMPDIR','PIP_CACHE_DIR','PYTHONNOUSERSITE','PYTHONDONTWRITEBYTECODE','PIP_DISABLE_PIP_VERSION_CHECK','YOLO_CONFIG_DIR','TORCH_HOME','HF_HOME')){$savedEnvironment[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
 & (Join-Path $PSScriptRoot 'meter-trial\setup-runtime.ps1') -TaskDirectory $taskDirectory
}finally{
 foreach($key in $savedEnvironment.Keys){[Environment]::SetEnvironmentVariable($key,$savedEnvironment[$key],'Process')}
 $resolved=(Resolve-Path -LiteralPath $taskDirectory).Path
 if($resolved -eq $taskDirectory -and [IO.Path]::GetDirectoryName($resolved) -eq (Join-Path $projectRoot 'tmp') -and [IO.Path]::GetFileName($resolved).StartsWith('setup-meter-reader-')){
  $items=@((Get-Item -LiteralPath $resolved -Force))+@(Get-ChildItem -LiteralPath $resolved -Recurse -Force)
  if(-not ($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1)){Remove-Item -LiteralPath $resolved -Recurse -Force}
 }
}
