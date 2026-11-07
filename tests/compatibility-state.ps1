$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
foreach($script in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../electron/native') -Filter '*.ps1') {
  $parseErrors=$null;$tokens=$null
  [void][Management.Automation.Language.Parser]::ParseFile($script.FullName,[ref]$tokens,[ref]$parseErrors)
  if($parseErrors.Count) {throw ($script.Name+': '+($parseErrors.Message -join '; '))}
}
. (Join-Path $PSScriptRoot '../electron/native/compatibility-state.ps1')
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('cablewise-state-'+[Guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($temporary)
$journal=Join-Path $temporary 'journal.json'
function Assert($Condition,[string]$Message) {if(!$Condition) {throw $Message}}
function Must-Reject([scriptblock]$Action,[string]$Message) {
  $rejected=$false
  try {& $Action | Out-Null} catch {$rejected=$true}
  Assert $rejected $Message
}
try {
  Must-Reject {Read-CablewiseRestoreEntries $journal @('controller-a')} 'Missing recovery journal must not establish restoration'
  [IO.File]::WriteAllText($journal,'{"truncated":')
  Must-Reject {Read-CablewiseRestoreEntries $journal @('controller-a')} 'Malformed recovery journal must not establish restoration'
  $entry=[pscustomobject]@{id='controller-a';hadValue=$false;value=0;changed=$true}
  [IO.File]::WriteAllText($journal,($entry|ConvertTo-Json))
  Must-Reject {Read-CablewiseRestoreEntries $journal @('controller-b')} 'Journal must not reach another device'
  $loaded=Read-CablewiseRestoreEntries $journal @('controller-a')
  Assert ($loaded.Count -eq 1 -and $loaded[0].changed) 'One-entry journals must load without losing transaction state'
  $entry.changed='false'
  [IO.File]::WriteAllText($journal,($entry|ConvertTo-Json))
  Must-Reject {Read-CablewiseRestoreEntries $journal @('controller-a')} 'String booleans are invalid recovery data'

  $entries=@(
    [pscustomobject]@{id='controller-a';hadValue=$false;value=0;changed=$true},
    [pscustomobject]@{id='controller-b';hadValue=$true;value=0;changed=$true})
  $calls=New-Object 'Collections.Generic.List[string]'
  $failures=Restore-CablewiseEntries $entries {
    param($e)
    [void]$calls.Add($e.id)
    if($e.id -eq 'controller-a') {throw 'simulated failed restart'}
  } {param($items) [IO.File]::WriteAllText($journal,($items|ConvertTo-Json))}
  Assert ($failures.Count -eq 1) 'A failed restore must be reported'
  Assert ($calls.Count -eq 2) 'A failed controller must not prevent restoring another controller'
  Assert ($entries[0].changed -and !$entries[1].changed) 'Only verified restoration can clear a pending entry'
  $persisted=Read-CablewiseRestoreEntries $journal @('controller-a','controller-b')
  Assert ($persisted[0].changed -and !$persisted[1].changed) 'Journal must retain the pending controller across process restarts'
  $failures=Restore-CablewiseEntries $persisted {param($e) [void]$calls.Add('retry-'+$e.id)} {param($items) [IO.File]::WriteAllText($journal,($items|ConvertTo-Json))}
  Assert ($failures.Count -eq 0 -and !$persisted[0].changed) 'A successful retry clears the pending controller'
  Assert ($calls.Count -eq 3 -and $calls[2] -eq 'retry-controller-a') 'Recovery retries only the unfinished controller'
  $persisted[0].changed=$true
  $failures=Restore-CablewiseEntries $persisted {param($e)} {throw 'simulated journal write failure'}
  Assert ($failures.Count -eq 1) 'A journal write failure must not become a successful result'
  Write-Output 'PASS recovery journal validation, partial failure, retry and write failure (no system changes)'
} finally {
  # This directory contains only the JSON fixture created above.
  if(Test-Path -LiteralPath $journal) {Remove-Item -LiteralPath $journal -Force}
  [IO.Directory]::Delete($temporary)
}
