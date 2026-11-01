param([switch]$Offline)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function ProjectPath([string]$relative) {
  $path = [IO.Path]::GetFullPath((Join-Path $project $relative))
  if (-not $path.StartsWith($project.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime path must stay inside this project.' }
  $cursor = $path
  while (-not (Test-Path -LiteralPath $cursor)) { $cursor = Split-Path -Parent $cursor }
  while ($cursor -and $cursor.Length -gt $project.Length) {
    if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Runtime paths must not follow a junction or symlink.' }
    $cursor = Split-Path -Parent $cursor
  }
  return $path
}
$runtime = ProjectPath '.runtime/paddleocr'
$python = ProjectPath '.runtime/meter-digits/visionstate-yolo/python/python.exe'
$packages = ProjectPath '.runtime/paddleocr/site-packages'
$models = ProjectPath '.runtime/paddleocr/models'
$cache = ProjectPath '.cache/pip'
$temporaryParent = ProjectPath '.runtime/paddleocr/tmp'
$temporary = Join-Path $temporaryParent ('setup-' + [guid]::NewGuid().ToString('N'))
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw 'Run the project-local meter reader setup first; this setup reuses its portable Python and ONNX Runtime.' }
foreach ($path in @($runtime, $models, $cache, $temporary)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
$environment = @{
  TEMP=$temporary; TMP=$temporary; TMPDIR=$temporary; PIP_CACHE_DIR=$cache; PIP_DISABLE_PIP_VERSION_CHECK='1'; PYTHONDONTWRITEBYTECODE='1';
  XDG_CACHE_HOME=(ProjectPath '.cache'); HF_HOME=(ProjectPath '.cache/huggingface'); MODELSCOPE_CACHE=(ProjectPath '.cache/modelscope');
  PADDLE_PDX_CACHE_HOME=(ProjectPath '.cache/paddlex'); PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK='True'; HF_HUB_OFFLINE='1'; TRANSFORMERS_OFFLINE='1';
  TROZY_PADDLE_RUNTIME=$runtime; TROZY_PROJECT_ROOT=$project
}
$saved = @{}
foreach ($key in $environment.Keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, $environment[$key], 'Process') }
$entries = @(
  @{name='PP-OCRv6_small_det'; repository='PaddlePaddle/PP-OCRv6_small_det_onnx'; revision='28fe5895c24fd108c19eb3e8479f4ab385fbfc62'; hashes=@{
    'inference.onnx'='d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e'; 'inference.yml'='193f435274bf9f0b5f71a929bbfbcf148282df7e633b34e7c373e8f44741b516';
    'inference.json'='89240f689a4a77aad75ef55a8df0a15c8e1d4980a327d17e58f24bbadde5aeab'; 'README.md'='e9403667f0f92055d8ce9e73a2beb1002fc489d9342697db74039eb7178bb5fb'}},
  @{name='PP-OCRv6_small_rec'; repository='PaddlePaddle/PP-OCRv6_small_rec_onnx'; revision='b8f84f0b80c529de40b4fbb3544b84fa7233a513'; hashes=@{
    'inference.onnx'='5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634'; 'inference.yml'='ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1';
    'inference.json'='f0bf53c853937a917affdd74467472167727f8ab0f0f7bded01c4a16c27e46e6'; 'README.md'='7d46dbd183ac09bd5a2e6b4577dcb29240751b1c00eb6813eca308d529f86806'}}
)
function RunPython([string[]]$arguments) {
  $ErrorActionPreference = 'Continue'
  & $python @arguments 2>&1 | ForEach-Object { Write-Host $_ }
  $script:pythonExit = $LASTEXITCODE
}
function EnablePackageInheritance([switch]$AfterInstall) {
  if (Test-Path -LiteralPath $packages -PathType Container) {
    if (-not $AfterInstall) {
      try { $probe = [IO.File]::OpenRead((Join-Path $packages 'paddleocr/__init__.py')); $probe.Dispose(); return } catch {}
    }
    # pip stages packages in private temporary directories; restore this project's inherited access.
    & icacls.exe $packages /inheritance:e /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot apply the project directory permissions to the local OCR packages.' }
  }
}
try {
  $licenseDirectory = ProjectPath '.runtime/paddleocr/licenses'
  New-Item -ItemType Directory -Path $licenseDirectory -Force | Out-Null
  foreach ($notice in @('PaddleOCR-Apache-2.0.txt','ONNX-Runtime-MIT.txt')) {
    $sourceNotice = ProjectPath ('licenses/' + $notice)
    $destinationNotice = Join-Path $licenseDirectory $notice
    if (-not (Test-Path -LiteralPath $destinationNotice)) { Copy-Item -LiteralPath $sourceNotice -Destination $destinationNotice }
  }
  Copy-Item -LiteralPath (ProjectPath 'THIRD-PARTY-NOTICES.md') -Destination (Join-Path $licenseDirectory 'THIRD-PARTY-NOTICES.md')
  EnablePackageInheritance
  $audit = @'
import os,sys
from pathlib import Path
audit_root=Path(os.environ['TROZY_PROJECT_ROOT']).resolve()
audit_writes=[]
def project_write(value):
 if isinstance(value,(str,bytes,os.PathLike)):
  candidate=Path(os.fsdecode(value)).resolve()
  if not candidate.is_relative_to(audit_root):
   raise PermissionError(f'OCR setup verification cannot write outside the project: {candidate}')
  audit_writes.append(str(candidate))
def audit(event,args):
 if event=='open':
  mode=args[1] or ''
  flags=args[2] if len(args)>2 else 0
  if any(letter in mode for letter in 'wax+') or flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND): project_write(args[0])
 elif event in ('os.mkdir','os.remove','os.rmdir'): project_write(args[0])
 elif event in ('os.rename','os.replace'):
  project_write(args[0]);project_write(args[1])
 elif event in ('socket.connect','socket.getaddrinfo'): raise PermissionError('OCR setup verification uses local models without Python socket network access.')
sys.addaudithook(audit)

'@
  $dependencyCheck = $audit + @'
import os,sys,importlib.metadata as m
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['TROZY_PADDLE_RUNTIME'])/'site-packages'))
try:
 assert m.version('paddleocr')=='3.7.0'
 assert m.version('paddlex')=='3.7.2'
 import paddleocr, paddlex, onnxruntime, cv2, pyclipper, shapely
 assert onnxruntime.__version__=='1.23.2'
except Exception:
 sys.exit(1)
'@
  $dependencyCheckPath = Join-Path $temporary 'dependency-check.py'
  [IO.File]::WriteAllText($dependencyCheckPath, $dependencyCheck, [Text.UTF8Encoding]::new($false))
  RunPython @('-B',$dependencyCheckPath)
  if ($script:pythonExit -ne 0) {
    if ($Offline) { throw 'The project-local PaddleOCR packages are missing or incomplete. Run setup without -Offline to install the pinned packages.' }
    New-Item -ItemType Directory -Path $packages -Force | Out-Null
    $pipArgs = @('-B','-m','pip','install','--target',$packages,'--upgrade','--only-binary=:all:','--index-url','https://pypi.org/simple','--cache-dir',$cache,'--report',(Join-Path $runtime 'package-install-report.json'))
    $lock = Join-Path $runtime 'requirements-lock.txt'
    if (Test-Path -LiteralPath $lock -PathType Leaf) { $pipArgs += @('--requirement',$lock) }
    else { $pipArgs += @('paddleocr==3.7.0','paddlex[ocr-core]==3.7.2') }
    RunPython $pipArgs
    if ($script:pythonExit -ne 0) { throw 'Project-local PaddleOCR dependency installation failed.' }
    EnablePackageInheritance -AfterInstall
  } else { Write-Host 'Reusing the installed project-local PaddleOCR packages and shared ONNX Runtime.' }
  foreach ($model in $entries) {
    $directory = Join-Path $models ($model.name + '_onnx_infer')
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    foreach ($file in @('inference.onnx','inference.yml','inference.json','README.md')) {
      $destination = Join-Path $directory $file
      if (Test-Path -LiteralPath $destination -PathType Leaf) {
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $model.hashes[$file]) { throw "Existing model hash is unexpected: $destination. It has been preserved for inspection." }
        continue
      }
      if ($Offline) { throw "Missing local model file: $destination" }
      $url = 'https://huggingface.co/' + $model.repository + '/resolve/' + $model.revision + '/' + $file
      $download = Join-Path $temporary ($model.name + '-' + $file)
      Write-Host "Downloading official $($model.name)/$file into the project."
      Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $download
      if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $model.hashes[$file]) { throw "Downloaded model hash mismatch: $($model.name)/$file" }
      Move-Item -LiteralPath $download -Destination $destination
    }
  }
  $verify = $audit + @'
import hashlib,importlib.metadata as metadata,json,os,sys,time
from pathlib import Path
runtime=Path(os.environ['TROZY_PADDLE_RUNTIME'])
packages=runtime/'site-packages'
sys.path.insert(0,str(packages))
import cv2,numpy as np,onnxruntime
from paddleocr import PaddleOCR
start=time.monotonic()
ocr=PaddleOCR(text_detection_model_name='PP-OCRv6_small_det',text_detection_model_dir=str(runtime/'models/PP-OCRv6_small_det_onnx_infer'),text_recognition_model_name='PP-OCRv6_small_rec',text_recognition_model_dir=str(runtime/'models/PP-OCRv6_small_rec_onnx_infer'),use_doc_orientation_classify=False,use_doc_unwarping=False,use_textline_orientation=False,device='cpu',engine='onnxruntime',engine_config={'providers':['CPUExecutionProvider'],'intra_op_num_threads':4,'inter_op_num_threads':1})
initialization=round((time.monotonic()-start)*1000)
image=np.full((240,900,3),255,dtype=np.uint8)
cv2.putText(image,'012345 kWh',(30,155),cv2.FONT_HERSHEY_SIMPLEX,2.8,(0,0,0),5,cv2.LINE_AA)
start=time.monotonic()
result=list(ocr.predict(input=image))
lines=[str(text) for page in result for text in page.get('rec_texts',[])]
assert any('012345' in text for text in lines),f'The synthetic smoke check did not recognize the fixture: {lines}'
distributions=sorted(metadata.distributions(path=[str(packages)]),key=lambda item:item.metadata['Name'].lower())
(runtime/'requirements-lock.txt').write_text('# Project-local PaddleOCR packages; ONNX Runtime 1.23.2 is reused from the meter reader Python.\n'+'\n'.join(f"{item.metadata['Name']}=={item.version}" for item in distributions)+'\n',encoding='utf-8')
models=[]
for name,revision in [('PP-OCRv6_small_det','28fe5895c24fd108c19eb3e8479f4ab385fbfc62'),('PP-OCRv6_small_rec','b8f84f0b80c529de40b4fbb3544b84fa7233a513')]:
 directory=runtime/'models'/f'{name}_onnx_infer'
 models.append({'name':name,'directory':str(directory.relative_to(runtime)),'repository':f'https://huggingface.co/PaddlePaddle/{name}_onnx','revision':revision,'license':'Apache-2.0','files':{file.name:{'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size} for file in sorted(directory.iterdir()) if file.is_file()}})
manifest={'schemaVersion':1,'model':'paddleocr-ppocrv6','engine':'onnxruntime-cpu','python':'../meter-digits/visionstate-yolo/python/python.exe','pythonVersion':sys.version.split()[0],'packageDirectory':'site-packages','packageSource':'https://pypi.org','versions':{name:metadata.version(name) for name in ['paddleocr','paddlex','onnxruntime','numpy','opencv-contrib-python']},'models':models,'smokeCheck':{'kind':'synthetic_fixture','texts':lines,'initializationMs':initialization,'inferenceMs':round((time.monotonic()-start)*1000),'pythonWriteAudit':'project-only','pythonSocketNetworkBlocked':True},'source':'Official PaddleOCR/PaddleX Python packages and official PaddlePaddle model repositories. No custom OCR preprocessing/decoder engine.'}
(runtime/'runtime-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest['smokeCheck'],ensure_ascii=False))
'@
  $verifyPath = Join-Path $temporary 'verify.py'
  [IO.File]::WriteAllText($verifyPath, $verify, [Text.UTF8Encoding]::new($false))
  RunPython @('-B',$verifyPath)
  if ($script:pythonExit -ne 0) { throw 'The official PaddleOCR CPU/ONNX smoke check failed; inspect the output above.' }
  Write-Host "PaddleOCR ready. Manifest: $(Join-Path $runtime 'runtime-manifest.json')"
} finally {
  foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
  $cleanupTarget = [IO.Path]::GetFullPath($temporary)
  if ($cleanupTarget.StartsWith($temporaryParent.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Parent $cleanupTarget) -eq $temporaryParent -and (Split-Path -Leaf $cleanupTarget).StartsWith('setup-')) {
    if (Test-Path -LiteralPath $cleanupTarget) { Remove-Item -LiteralPath $cleanupTarget -Recurse -Force }
  } else { throw 'Refusing to clean an unexpected temporary directory.' }
}
