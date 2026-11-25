$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$python = Join-Path $projectRoot '.runtime\meter-digits\visionstate-yolo\python\python.exe'
$target = Join-Path $projectRoot '.runtime\meter-digits\train-gpu-packages'
$cache = Join-Path $projectRoot '.cache\pip'
$taskTemp = Join-Path $projectRoot ('tmp\setup-gpu-train-' + [Guid]::NewGuid().ToString('N'))

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'Portable Python runtime not found. Run setup-meter-reader.ps1 first.'
}

New-Item -ItemType Directory -Path $target, $cache, $taskTemp -Force | Out-Null
$saved = @{}
$envVars = @{
  TEMP = $taskTemp
  TMP = $taskTemp
  TMPDIR = $taskTemp
  PIP_CACHE_DIR = $cache
  PIP_DISABLE_PIP_VERSION_CHECK = '1'
  PYTHONNOUSERSITE = '1'
  PYTHONDONTWRITEBYTECODE = '1'
}
foreach ($k in $envVars.Keys) {
  $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
  [Environment]::SetEnvironmentVariable($k, $envVars[$k], 'Process')
}

try {
  & $python -B -m pip install --target $target --no-deps --upgrade --only-binary=:all: --cache-dir $cache --index-url 'https://download.pytorch.org/whl/cu126' 'torch==2.8.0' 'torchvision==0.23.0'
  if ($LASTEXITCODE -ne 0) {
    throw 'CUDA PyTorch installation failed.'
  }
  & icacls.exe $target /inheritance:e /T /Q | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to restore inherited directory ACLs on train-gpu-packages.'
  }
  $siteCustomize = Join-Path $projectRoot '.runtime\meter-digits\visionstate-yolo\python\Lib\site-packages\sitecustomize.py'
  $code = @"
import os, sys
if os.environ.get('TROZY_USE_TRAIN_GPU') == '1':
    p = os.environ.get('TROZY_TRAIN_GPU_SITE')
    if p and os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)
"@
  [IO.File]::WriteAllText($siteCustomize, $code, [Text.UTF8Encoding]::new($false))

  $env:TROZY_USE_TRAIN_GPU = '1'
  $env:TROZY_TRAIN_GPU_SITE = $target
  & $python -B -c "import torch, torchvision; print('CUDA torch:', torch.__version__, 'torchvision:', torchvision.__version__, 'cuda_available:', torch.cuda.is_available(), 'device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none')"
  if ($LASTEXITCODE -ne 0) {
    throw 'CUDA PyTorch verification failed.'
  }
} finally {
  Remove-Item Env:TROZY_USE_TRAIN_GPU -ErrorAction SilentlyContinue
  Remove-Item Env:TROZY_TRAIN_GPU_SITE -ErrorAction SilentlyContinue
  foreach ($k in $saved.Keys) {
    [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process')
  }
  $resolved = [IO.Path]::GetFullPath($taskTemp)
  if ($resolved.StartsWith((Join-Path $projectRoot 'tmp\'), [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved).StartsWith('setup-gpu-train-')) {
    if (Test-Path -LiteralPath $resolved) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}
