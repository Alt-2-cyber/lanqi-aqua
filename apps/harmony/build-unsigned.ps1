param(
  [string]$DevEcoHome = 'D:/Program Files/Huawei/DevEco Studio',
  [string]$StagingDirectory = '',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
if (-not $StagingDirectory) {
  $StagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('lanqi-harmony-' + [Guid]::NewGuid().ToString('N'))
}
$StagingDirectory = [System.IO.Path]::GetFullPath($StagingDirectory)
if ($StagingDirectory -notmatch '^[A-Za-z]:[\\/][A-Za-z0-9_ .()@/\\-]+$') {
  throw 'Hvigor requires an ASCII project path. Set -StagingDirectory to a new ASCII path, for example D:/lanqi-build.'
}
if (Test-Path -LiteralPath $StagingDirectory) {
  throw 'Choose a new, empty staging directory. This script does not overwrite or remove existing build workspaces.'
}
if (-not $OutputPath) {
  $OutputPath = Join-Path $PSScriptRoot '../../artifacts/lanqi-aqua-harmony-unsigned.hap'
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$node = Join-Path $DevEcoHome 'tools/node/node.exe'
$hvigor = Join-Path $DevEcoHome 'tools/hvigor/bin/hvigorw.js'
if (-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $hvigor)) {
  throw 'DevEco build tools were not found. Set -DevEcoHome to your DevEco Studio installation.'
}

New-Item -ItemType Directory -Path $StagingDirectory | Out-Null
# A real source copy is necessary: Hvigor rejects non-ASCII paths and junctions.
& robocopy $PSScriptRoot $StagingDirectory /E /XD .hvigor .idea build oh_modules node_modules signing /XF local.properties '*.p12' '*.p7b' '*.cer' '*.csr' '*.jks' '*.keystore' /NJH /NJS /NFL /NDL /NP
if ($LASTEXITCODE -ge 8) { throw "Source copy failed: robocopy exit $LASTEXITCODE" }

$env:DEVECO_SDK_HOME = Join-Path $DevEcoHome 'sdk'
$env:OHOS_SDK_HOME = Join-Path $DevEcoHome 'sdk/default/openharmony'
$env:JAVA_HOME = Join-Path $DevEcoHome 'jbr'
$env:NODE_HOME = Join-Path $DevEcoHome 'tools/node'
Push-Location -LiteralPath $StagingDirectory
try {
  & $node $hvigor --mode module -p product=default -p module=entry@default -p buildMode=release assembleHap --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Hvigor build failed: exit $LASTEXITCODE. Staging source remains at $StagingDirectory" }
  $hap = Join-Path $StagingDirectory 'entry/build/default/outputs/default/entry-default-unsigned.hap'
  if (-not (Test-Path -LiteralPath $hap)) { throw "Unsigned HAP was not produced at $hap" }
  New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
  Copy-Item -LiteralPath $hap -Destination $OutputPath -Force
  Write-Host "Unsigned HAP: $OutputPath"
  Write-Host "Build workspace: $StagingDirectory"
  Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256
} finally {
  Pop-Location
}
