# Bind a locally saved compatibility result to this Windows installation and
# current firmware. Only the digest is retained; raw machine IDs are not exported.
function Get-CablewiseHostFingerprint {
  $machine = (Get-ItemProperty -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction Stop).MachineGuid
  $firmware = (Get-CimInstance Win32_BIOS -ErrorAction Stop).SMBIOSBIOSVersion
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes("$machine|$firmware")))).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose() }
}
