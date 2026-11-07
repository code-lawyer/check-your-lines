$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -Path (Join-Path $PSScriptRoot 'UcsiReader.cs')
[ordered]@{ controllers=@([CablewiseUcsi]::Read()); scannedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Depth 12 -Compress
