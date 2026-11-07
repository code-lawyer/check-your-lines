# Pure transaction helpers, shared by the elevated worker and failure tests.
# No registry, device or elevation access is performed in this file.
function Read-CablewiseRestoreEntries([string]$Path,[string[]]$AllowedIds) {
  if(!(Test-Path -LiteralPath $Path -PathType Leaf)) {throw '恢复日志缺失，无法确认原有设置。恢复记录已保留。'}
  $decoded=Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  $entries=@($decoded)
  if(!$entries.Count) {throw '恢复日志为空，无法确认原有设置。'}
  $seen=@{}
  foreach($entry in $entries) {
    if($entry.id -isnot [string] -or $entry.id -notin $AllowedIds -or $seen.ContainsKey($entry.id) -or
      $entry.hadValue -isnot [bool] -or $entry.changed -isnot [bool] -or
      $entry.value -isnot [ValueType] -or $entry.value -is [bool] -or
      [decimal]$entry.value -lt 0 -or [decimal]$entry.value -gt [uint32]::MaxValue -or
      [decimal]$entry.value -ne [decimal]::Truncate([decimal]$entry.value)) {
      throw '恢复日志无效或与当前控制器不符，未修改其他设备。'
    }
    $seen[$entry.id]=$true
  }
  return ,$entries
}
function Restore-CablewiseEntries([object[]]$Entries,[scriptblock]$RestoreEntry,[scriptblock]$SaveJournal) {
  $failures=@()
  foreach($entry in $Entries) {
    if(!$entry.changed) {continue}
    try {
      & $RestoreEntry $entry
      # The callback must verify both the original setting and controller health.
      $entry.changed=$false
      & $SaveJournal $Entries
    } catch {$failures+=$_.Exception.Message}
  }
  return ,$failures
}
