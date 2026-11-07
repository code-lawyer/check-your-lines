$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$warnings = @()
$hostFingerprint = $null
try { . (Join-Path $PSScriptRoot 'host-fingerprint.ps1'); $hostFingerprint = Get-CablewiseHostFingerprint } catch {}
$connections = @{}
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'UsbConnections.cs')
  foreach ($connection in [CablewiseUsb]::Read()) { $connections[$connection.DriverKey] = $connection }
} catch { $warnings += '部分 USB 端口属性读取失败；无法确认归属的设备保留在扫描详情中。' }
$nativeProperties=$false
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'DeviceProperties.cs')
  $all=@([CablewiseDevices]::Read())
  $nativeProperties=$true
} catch {
  $all = @(Get-CimInstance Win32_PnPEntity)
  $warnings += '部分设备属性改用系统备用查询，扫描可能较慢。'
}
$byId = @{}
foreach($node in $all) { if($node.PNPDeviceID) { $byId[$node.PNPDeviceID]=$node } }
$devices = @($all | Where-Object { $_.PNPDeviceID -match '^USB\\VID_[0-9A-F]{4}&PID_[0-9A-F]{4}' -and $_.PNPDeviceID -notmatch '&MI_[0-9A-F]{2}' -and $_.Present -ne $false -and $_.ConfigManagerErrorCode -eq 0 } | ForEach-Object {
  $device = $_
  $driverKey = $null; $registry = $null; $containerId = $null; $removable = $null
  try {
    $registry = Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\' + $device.PNPDeviceID) -ErrorAction Stop
    $driverKey = $registry.Driver
    if ($null -ne $registry.Capabilities) { $removable = ([int]$registry.Capabilities -band 4) -ne 0 }
  } catch {}
  $connection = if ($driverKey) { $connections[$driverKey] } else { $null }
  $displayName = $device.Name
  # Composite phones expose their model on the WPD child. Use the parent-child
  # relation for its name, but keep exactly one record for the physical port.
  if ($device.Service -eq 'usbccgp' -and (!$connection -or $connection.UserConnectable -ne $false)) {
    try {
      if($nativeProperties) {$childIds=@($device.Children);$description=$device.BusDescription}
      else {
        $properties = @(Get-PnpDeviceProperty -InstanceId $device.PNPDeviceID -KeyName DEVPKEY_Device_Children,DEVPKEY_Device_BusReportedDeviceDesc -ErrorAction Stop)
        $childIds = @($properties | Where-Object {$_.KeyName -eq 'DEVPKEY_Device_Children'} | ForEach-Object {$_.Data})
        $description = ($properties | Where-Object {$_.KeyName -eq 'DEVPKEY_Device_BusReportedDeviceDesc'}).Data
      }
      $portable = @($childIds | ForEach-Object {$byId[$_]} | Where-Object {$_ -and $_.PNPClass -eq 'WPD' -and $_.Present -ne $false -and $_.ConfigManagerErrorCode -eq 0})
      if($portable.Count -eq 1) { $displayName=$portable[0].Name }
      else {
        if($description) { $displayName=$description }
      }
    } catch {}
  }
  if (!$connection -or $null -eq $connection.UserConnectable) {
    if($nativeProperties) {$containerId=$device.ContainerId}
    else {try { $containerId = '{' + (Get-PnpDeviceProperty -InstanceId $device.PNPDeviceID -KeyName DEVPKEY_Device_ContainerId -ErrorAction Stop).Data.ToString() + '}' } catch {}}
  }
  [ordered]@{
    id=$device.PNPDeviceID; name=$displayName
    speed=if($connection){$connection.Speed}else{$null}; location=if($connection){$connection.Location}else{$null}
    userConnectable=if($connection){$connection.UserConnectable}else{$null}
    hostConnectorTypeC=if($connection){$connection.HostConnectorTypeC}else{$null}
    hubPath=if($connection){$connection.HubPath}else{$null}; portNumber=if($connection){$connection.PortNumber}else{$null}
    removable=$removable; containerId=$containerId; isHub=($device.Service -match '^USBHUB')
  }
})
$ucsiDevices = @($all | Where-Object { ($_.Service -match 'UcmUcsi' -or $_.PNPDeviceID -match '^ACPI\\USBC000') -and $_.Present -ne $false })
$controllers = @($ucsiDevices | ForEach-Object {
  $enabled = $false
  try { $enabled = (Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\' + $_.PNPDeviceID + '\Device Parameters') -Name TestInterfaceEnabled -ErrorAction Stop).TestInterfaceEnabled -eq 1 } catch {}
  [ordered]@{ id=$_.PNPDeviceID; name=$_.Name; testInterfaceEnabled=$enabled; statusCode=$_.ConfigManagerErrorCode }
})
[ordered]@{
  devices=$devices
  ucsiPresent=($controllers.Count -gt 0)
  ucsi=[ordered]@{hostFingerprint=$hostFingerprint; controllers=$controllers; state=if(!$controllers.Count){'absent'}elseif(@($controllers | Where-Object {$_.testInterfaceEnabled}).Count){'enabled'}else{'disabled'}}
  warnings=$warnings
} | ConvertTo-Json -Depth 6 -Compress
