param([Parameter(Mandatory=$true)][string]$JobDirectory,[switch]$RestoreOnly)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$exe=if(Test-Path (Join-Path $PSHOME 'pwsh.exe')){Join-Path $PSHOME 'pwsh.exe'}else{Join-Path $PSHOME 'powershell.exe'}
$script=Join-Path $PSScriptRoot 'compatibility-check.ps1'
if($JobDirectory.Contains('"')) {throw 'Invalid directory'}
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'" -JobDirectory "'+$JobDirectory+'"'
if($RestoreOnly) {$arguments+=' -RestoreOnly'}
try {
  $process=Start-Process -FilePath $exe -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  @{cancelled=$false;exitCode=$process.ExitCode} | ConvertTo-Json -Compress
} catch {
  if($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223) {@{cancelled=$true} | ConvertTo-Json -Compress}
  else {throw}
}
