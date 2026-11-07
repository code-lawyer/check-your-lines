# Requires explicit user confirmation through the app and Windows UAC.
# Only the temporary UCSI test-interface setting is changed; native queries are
# read-only. The original value is journalled before mutation and restored.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$JobDirectory, [switch]$RestoreOnly)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
. (Join-Path $PSScriptRoot 'host-fingerprint.ps1')
. (Join-Path $PSScriptRoot 'compatibility-state.ps1')
$job=(Get-Item -LiteralPath $JobDirectory -ErrorAction Stop)
$jobId=[Guid]::Empty
if(!$job.PSIsContainer -or ![Guid]::TryParse($job.Name,[ref]$jobId) -or $job.Parent.Name -ne 'compatibility-checks') { throw 'Invalid compatibility job directory' }
$walk=$job
while($walk) { if($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Compatibility output cannot use redirected directories' }; $walk=$walk.Parent }
$journalPath=Join-Path $job.FullName 'restore-state.json'
$reportPath=Join-Path $job.FullName 'report.json'
foreach($p in @($journalPath,$reportPath)) { if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Compatibility output cannot use redirected files' } }
function Write-Json($Object,[string]$Path) { [IO.File]::WriteAllText($Path,($Object|ConvertTo-Json -Depth 15),(New-Object Text.UTF8Encoding($false))) }
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator consent is required; no settings changed' }
$report=[ordered]@{startedAt=[DateTime]::UtcNow.ToString('o');hostFingerprint=(Get-CablewiseHostFingerprint);restored=$false;error=$null;native=$null}
$knownControllers=@(Get-CimInstance Win32_PnPEntity | Where-Object {$_.Service -match 'UcmUcsi' -or $_.PNPDeviceID -match '^ACPI\\USBC000'})
$controllers=@($knownControllers | Where-Object {$_.Present -ne $false -and $_.ConfigManagerErrorCode -eq 0})
# Recovery must still reach a controller whose preceding restart failed.
$controllerIds=@($knownControllers | ForEach-Object {$_.PNPDeviceID})
function Key-Path([string]$Id) { "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\$Id\Device Parameters" }
function Read-Setting([string]$Id) {
  $key=Get-Item -LiteralPath (Key-Path $Id) -ErrorAction Stop
  $hadValue=$key.GetValueNames() -contains 'TestInterfaceEnabled'
  $value=0
  if($hadValue) {
    if($key.GetValueKind('TestInterfaceEnabled') -ne [Microsoft.Win32.RegistryValueKind]::DWord) {throw '现有诊断设置类型异常，未覆盖该设置。'}
    $value=[long]$key.GetValue('TestInterfaceEnabled')
    if($value -lt 0) {$value+=4294967296}
  }
  return @{hadValue=$hadValue;value=$value}
}
function Run-Bounded([string]$File,[string]$Arguments,[int]$TimeoutMs) {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$File;$info.Arguments=$Arguments;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.StandardOutputEncoding=New-Object Text.UTF8Encoding($false)
  $info.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info
  try {
    [void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    if(!$process.WaitForExit($TimeoutMs)) { $process.Kill();$process.WaitForExit();throw '设备读取超时，已结束读取并准备恢复设置。' }
    return @{exitCode=$process.ExitCode;output=$stdout.GetAwaiter().GetResult();error=$stderr.GetAwaiter().GetResult()}
  } finally {$process.Dispose()}
}
function Restart-Controller([string]$Id) {
  if($Id -notin $controllerIds -or $Id.Contains('"')) {throw 'Unexpected controller'}
  $result=Run-Bounded (Join-Path $env:SystemRoot 'System32\pnputil.exe') ('/restart-device "'+$Id+'"') 20000
  if($result.exitCode -ne 0) {throw ('USB-C 控制器未能重新启动：'+$result.output)}
}
$entries=@()
$restorationKnown=!$RestoreOnly
$mutex=New-Object Threading.Mutex($false,'Local\Cablewise.UcsiCompatibility')
$ownsMutex=$false
try {
  try {$ownsMutex=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$ownsMutex=$true}
  if(!$ownsMutex) {throw '另一项 USB-C 检查仍在运行，请等待它完成后重试。'}
  if($RestoreOnly) {
    $entries=Read-CablewiseRestoreEntries $journalPath $controllerIds
    $restorationKnown=$true
  } else {
    if(!$controllers.Count) {throw '这台电脑没有提供可用的 UCSI 控制器。没有更改系统设置。'}
    if(Test-Path -LiteralPath $journalPath) {$restorationKnown=$false;throw '诊断目录已使用，请先完成上一次恢复。'}
    $entries=@($controllers | ForEach-Object {
      $setting=Read-Setting $_.PNPDeviceID
      [pscustomobject]@{id=$_.PNPDeviceID;hadValue=$setting.hadValue;value=$setting.value;changed=$false}
    })
    Write-Json @($entries) $journalPath
    foreach($entry in $entries) {
      if($entry.value -eq 1) {continue}
      $entry.changed=$true;Write-Json @($entries) $journalPath
      New-ItemProperty -LiteralPath (Key-Path $entry.id) -Name TestInterfaceEnabled -PropertyType DWord -Value 1 -Force | Out-Null
      Restart-Controller $entry.id
    }
    $psExe=if(Test-Path (Join-Path $PSHOME 'pwsh.exe')){Join-Path $PSHOME 'pwsh.exe'}else{Join-Path $PSHOME 'powershell.exe'}
    $script=Join-Path $PSScriptRoot 'scan-ucsi.ps1'
    $result=Run-Bounded $psExe ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'"') 30000
    if($result.exitCode-ne 0) {throw ('无法读取 USB-C 控制器：'+$result.error)}
    $report.native=$result.output | ConvertFrom-Json
  }
} catch {$report.error=$_.Exception.Message}
finally {
  $restoreErrors=Restore-CablewiseEntries $entries {
      param($entry)
      if($entry.id -notin $controllerIds) {throw '控制器身份不符'}
      $key=Key-Path $entry.id
      if($entry.hadValue) {New-ItemProperty -LiteralPath $key -Name TestInterfaceEnabled -PropertyType DWord -Value ([uint32]$entry.value) -Force | Out-Null}
      elseif((Read-Setting $entry.id).hadValue) {Remove-ItemProperty -LiteralPath $key -Name TestInterfaceEnabled -ErrorAction Stop}
      Restart-Controller $entry.id
      $actual=Read-Setting $entry.id
      if($actual.hadValue -ne $entry.hadValue -or ($entry.hadValue -and $actual.value -ne $entry.value)) {throw '诊断设置尚未恢复为原值'}
      $device=Get-CimInstance Win32_PnPEntity | Where-Object {$_.PNPDeviceID -eq $entry.id}
      if(!$device -or $device.Present -eq $false -or $device.ConfigManagerErrorCode -ne 0) {throw 'USB-C 控制器尚未恢复正常状态'}
  } {param($items) Write-Json @($items) $journalPath}
  $report.restored=($restorationKnown -and $restoreErrors.Count-eq 0)
  if($restoreErrors.Count) {$report.error='需要恢复 USB-C 设置：'+($restoreErrors-join '; ')}
  $report.finishedAt=[DateTime]::UtcNow.ToString('o')
  Write-Json $report $reportPath
  if($ownsMutex) {$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
if(!$report.restored-or $report.error) {exit 1}
