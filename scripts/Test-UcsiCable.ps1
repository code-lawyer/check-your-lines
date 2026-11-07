#requires -Version 7.0
# Local, temporary diagnostic. Source of the test-interface procedure:
# https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/ucsi#how-to-test-ucsi
# Does not install drivers, reset the PPM, set power roles, or change PD contracts.
[CmdletBinding()]
param([switch]$RestoreOnly, [switch]$NativeReader, [ValidateRange(0,10)][int]$ObserveSeconds=0, [ValidateRange(1, 8)][int]$MaxConnectors = 4)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'electron\native\host-fingerprint.ps1')
$outDir = Join-Path $root 'work\ucsi'
$journalPath = Join-Path $outDir 'restore-state.json'
$reportPath = Join-Path $outDir $(if($NativeReader){'native-probe.json'}else{'hardware-probe.json'})
$tool = Join-Path $outDir 'UcsiControl.exe'
$expectedHash = '22AC51EF4503E4FF3344B7C33FFB7509F43D26F5F4942A2C382DD91F4FB7B9A7'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (!([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'This temporary probe requires Administrator consent. No settings were changed.' }

function Invoke-BoundedProcess([string]$File, [string[]]$Arguments, [int]$TimeoutMs = 5000) {
  $info = [Diagnostics.ProcessStartInfo]::new($File)
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $info
  try {
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit($TimeoutMs)) { $process.Kill($true); $process.WaitForExit(); throw "Timed out: $([IO.Path]::GetFileName($File))" }
    return [ordered]@{exitCode=$process.ExitCode; output=$stdout.GetAwaiter().GetResult(); error=$stderr.GetAwaiter().GetResult()}
  } finally { $process.Dispose() }
}
function Restart-Controller([string]$Id) {
  $result = Invoke-BoundedProcess (Join-Path $env:SystemRoot 'System32\pnputil.exe') @('/restart-device', $Id) 20000
  if ($result.exitCode -ne 0) { throw "UCSI restart failed (code $($result.exitCode)); no automatic computer restart will be attempted. $($result.output)" }
}
function Registry-Path([string]$Id) { return "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\$Id\Device Parameters" }
function Restore-Controllers($Entries) {
  foreach ($entry in $Entries) {
    if (!$entry.changed) { continue }
    # Restoration is restricted to current UCSI controllers, even for a journal.
    if ($entry.id -notin $script:controllerIds) { throw 'The restore journal contains an unexpected device. No unrelated registry key will be changed.' }
    $key = Registry-Path $entry.id
    if ($entry.hadValue) { New-ItemProperty -LiteralPath $key -Name TestInterfaceEnabled -PropertyType DWord -Value ([uint32]$entry.value) -Force | Out-Null }
    else { Remove-ItemProperty -LiteralPath $key -Name TestInterfaceEnabled -ErrorAction SilentlyContinue }
    Restart-Controller $entry.id
    $entry.changed = $false
    ConvertTo-Json -InputObject @($Entries) -Depth 6 | Set-Content -LiteralPath $journalPath -Encoding utf8
  }
}
$controllers = @(Get-CimInstance Win32_PnPEntity | Where-Object { ($_.Service -match 'UcmUcsi' -or $_.PNPDeviceID -match '^ACPI\\USBC000') -and $_.Present -ne $false -and $_.ConfigManagerErrorCode -eq 0 })
$script:controllerIds = @($controllers | ForEach-Object { $_.PNPDeviceID })
if (!$controllers.Count) { throw 'No healthy UCSI controller was found. No settings were changed.' }
if ($RestoreOnly) {
  $previous = @(Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json)
  Restore-Controllers $previous
  exit 0
}
if (!$NativeReader -and (Get-FileHash -LiteralPath $tool -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Microsoft diagnostic tool hash did not match the prepared download. No settings were changed.' }
if (Test-Path -LiteralPath $journalPath) {
  $previous = @(Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json)
  if (@($previous | Where-Object { $_.changed }).Count) { throw 'A previous probe needs restoration. Run this script with -RestoreOnly first.' }
}
$entries = @($controllers | ForEach-Object {
  $key = Registry-Path $_.PNPDeviceID
  $value = Get-ItemProperty -LiteralPath $key -Name TestInterfaceEnabled -ErrorAction SilentlyContinue
  [pscustomobject]@{id=$_.PNPDeviceID; hadValue=($null -ne $value); value=if($null -ne $value){$value.TestInterfaceEnabled}else{0}; changed=$false}
})
$report = [ordered]@{startedAt=[DateTime]::UtcNow.ToString('o'); hostFingerprint=(Get-CablewiseHostFingerprint); toolSha256=$expectedHash; probes=[Collections.Generic.List[object]]::new(); restored=$false; error=$null}
function Save-Report { $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $reportPath -Encoding utf8 }
function Probe([string]$Name, [uint64]$Control) {
  $high = [uint32]($Control -shr 32); $low = [uint32]($Control -band [uint64]4294967295)
  # Both Send operands are hexadecimal, including the upper 32 bits.
  $result = Invoke-BoundedProcess $tool @('Send', $high.ToString('X'), $low.ToString('X'))
  $report.probes.Add([ordered]@{name=$Name; control=$Control.ToString('X'); result=$result})
  Save-Report
  if ($result.output -match 'AsUInt64:\s*0x([0-9a-fA-F]+)' -and [Convert]::ToUInt64($Matches[1],16) -ne $Control) { throw 'Diagnostic tool did not echo the intended command.' }
}
try {
  foreach ($entry in $entries) {
    if ($entry.value -eq 1) { continue }
    # Persist the old value BEFORE the first mutation, so recovery survives interruption.
    $entry.changed = $true
    ConvertTo-Json -InputObject @($entries) -Depth 6 | Set-Content -LiteralPath $journalPath -Encoding utf8
    New-ItemProperty -LiteralPath (Registry-Path $entry.id) -Name TestInterfaceEnabled -PropertyType DWord -Value 1 -Force | Out-Null
    Restart-Controller $entry.id
  }
  if ($ObserveSeconds) { Start-Sleep -Seconds $ObserveSeconds }
  if ($NativeReader) {
    $nativeResult = Invoke-BoundedProcess (Join-Path $PSHOME 'pwsh.exe') @('-NoProfile','-NonInteractive','-File',(Join-Path $root 'electron\native\scan-ucsi.ps1')) 30000
    if ($nativeResult.exitCode -ne 0) { throw $nativeResult.error }
    $report.native = $nativeResult.output | ConvertFrom-Json
  } else {
  Probe 'GET_CAPABILITY' 6
  $connectorCount = $MaxConnectors
  if ($report.probes[0].result.output -match 'bNumConnectors:\s*(\d+)') { $connectorCount = [Math]::Min($MaxConnectors,[int]$Matches[1]) }
  for ($connector = 1; $connector -le $connectorCount; $connector++) {
    $prefix = [uint64]$connector -shl 16
    Probe "CONNECTOR_$connector GET_CONNECTOR_CAPABILITY" ($prefix -bor 7)
    Probe "CONNECTOR_$connector GET_CONNECTOR_STATUS" ($prefix -bor 0x12)
    Probe "CONNECTOR_$connector GET_CABLE_PROPERTY" ($prefix -bor 0x11)
    # UCSI GET_PD_MESSAGE: request a Discover Identity response from cable SOP'.
    # UCSI 1.x may reject this optional command. It cannot change a power contract.
    # First 16 bytes then 12 bytes; MESSAGE_IN on older firmware is only 16 bytes.
    foreach ($part in @(@{offset=0;bytes=16}, @{offset=16;bytes=12})) {
      $command = $prefix -bor 0x15 -bor ([uint64]2 -shl 23) -bor ([uint64]$part.offset -shl 26) -bor ([uint64]$part.bytes -shl 34) -bor ([uint64]4 -shl 42)
      Probe "CONNECTOR_$connector GET_CABLE_IDENTITY_$($part.offset)" $command
    }
  }
  }
} catch { $report.error = $_.Exception.Message }
finally {
  try { Restore-Controllers $entries; $report.restored = $true }
  catch { $report.error = "$($report.error) RESTORE REQUIRED: $($_.Exception.Message)" }
  $report.finishedAt = [DateTime]::UtcNow.ToString('o')
  Save-Report
}
if (!$report.restored -or $report.error) { exit 1 }
