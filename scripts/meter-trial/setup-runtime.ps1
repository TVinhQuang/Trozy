param([string]$TaskDirectory)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runtimeRoot=Join-Path $projectRoot '.runtime\meter-digits\visionstate-yolo'
if(-not $TaskDirectory){throw 'Pass a distinct project-local TaskDirectory.'}
$TaskDirectory=[IO.Path]::GetFullPath($TaskDirectory)
if(-not $TaskDirectory.StartsWith($projectRoot+'\tmp\',[StringComparison]::OrdinalIgnoreCase)){throw 'Task temp must be in project tmp.'}
New-Item -ItemType Directory -Path $TaskDirectory,$runtimeRoot,(Join-Path $runtimeRoot 'models'),(Join-Path $projectRoot '.cache\pip') -Force | Out-Null
$env:TEMP=$TaskDirectory;$env:TMP=$TaskDirectory;$env:TMPDIR=$TaskDirectory
$env:PIP_CACHE_DIR=Join-Path $projectRoot '.cache\pip'
$env:PYTHONNOUSERSITE='1';$env:PYTHONDONTWRITEBYTECODE='1';$env:PIP_DISABLE_PIP_VERSION_CHECK='1'
$env:YOLO_CONFIG_DIR=Join-Path $runtimeRoot 'ultralytics-config'
$env:TORCH_HOME=Join-Path $runtimeRoot 'torch-cache'
$env:HF_HOME=Join-Path $runtimeRoot 'huggingface-cache'
function Get-VerifiedFile([string]$Url,[string]$Destination,[string]$Sha256){
 if(Test-Path -LiteralPath $Destination){
  if((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256){throw "Existing file hash differs: $Destination"}
  Write-Output "Reused $Destination";return
 }
 $download=Join-Path $TaskDirectory ([IO.Path]::GetFileName($Destination)+'.download')
 & curl.exe --fail --location --retry 2 --silent --show-error --output $download $Url
 if($LASTEXITCODE -ne 0){throw "Download failed: $Url"}
 if((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256){throw "SHA-256 mismatch: $Url"}
 Move-Item -LiteralPath $download -Destination $Destination
 Write-Output "Verified $Destination"
}
$pythonRoot=Join-Path $runtimeRoot 'python';$python=Join-Path $pythonRoot 'python.exe'
if(-not (Test-Path -LiteralPath $python)){
 $archive=Join-Path $TaskDirectory 'python-3.12.10-embed-amd64.zip'
 Get-VerifiedFile 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' $archive '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3'
 New-Item -ItemType Directory -Path $pythonRoot -Force | Out-Null
 Expand-Archive -LiteralPath $archive -DestinationPath $pythonRoot -Force
}
$site=Join-Path $pythonRoot 'Lib\site-packages'
New-Item -ItemType Directory -Path $site -Force | Out-Null
Set-Content -LiteralPath (Join-Path $pythonRoot 'python312._pth') -Value "python312.zip`n.`nLib\site-packages`nimport site" -Encoding ASCII
if(-not (Test-Path -LiteralPath (Join-Path $site 'pip'))){
 $metadata=Invoke-RestMethod -Uri 'https://pypi.org/pypi/pip/25.3/json'
 $wheel=$metadata.urls | Where-Object {$_.filename -eq 'pip-25.3-py3-none-any.whl'} | Select-Object -First 1
 if(-not $wheel){throw 'Official pip wheel metadata missing'}
 $wheelFile=Join-Path $TaskDirectory $wheel.filename
 Get-VerifiedFile $wheel.url $wheelFile $wheel.digests.sha256
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 [IO.Compression.ZipFile]::ExtractToDirectory($wheelFile,$site)
}
$models=Join-Path $runtimeRoot 'models'
Get-VerifiedFile 'https://huggingface.co/oleost/visionstate-wheel-reader/resolve/563f365a5b377c10c7248517ef2576ac5cee3cbf/wheels-v2.onnx' (Join-Path $models 'wheels-v2.onnx') '5644705e1f0e684b30bf3c7a6cb23e7eb1ddda616cd16b5321423f45bf7fd8b6'
Get-VerifiedFile 'https://huggingface.co/ntarekp/watermeter-yolov8-obb/resolve/c00b2752e3ad762eb269a05e1dceb28f48c1f27b/stage1_meter_window_digits.pt' (Join-Path $models 'stage1_meter_window_digits.pt') 'f2882a477bc12ecc5526cf73438d254945271c3e1b2b4214aa8e4deb637c3be9'
# Explicit CPU wheels avoid downloading GPU runtimes. All installs remain in pythonRoot.
& $python -m pip install --only-binary=:all: --index-url 'https://download.pytorch.org/whl/cpu' 'torch==2.8.0' 'torchvision==0.23.0'
if($LASTEXITCODE -ne 0){throw 'CPU torch install failed'}
& $python -m pip install --only-binary=:all: 'ultralytics==8.4.194' 'onnxruntime==1.23.2' 'onnx==1.19.1'
if($LASTEXITCODE -ne 0){throw 'Trial package install failed'}
& $python -m pip freeze | Set-Content -LiteralPath (Join-Path $runtimeRoot 'requirements-lock.txt') -Encoding UTF8
if($LASTEXITCODE -ne 0){throw 'Runtime lock failed'}
Write-Output "Portable CPU trial runtime ready: $python"
