const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const { buildWindowsSnapshot } = require('../../shared/windows-snapshot.cjs');
const execute = promisify(execFile);
async function scanWindows(capabilityProfile = null) {
  const ps7 = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
  const exe = fs.existsSync(ps7) ? ps7 : path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let script = path.join(__dirname, '..', 'native', 'scan-windows.ps1');
  if (script.includes('app.asar')) script = script.replace('app.asar', 'app.asar.unpacked');
  const { stdout } = await execute(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' });
  const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  return buildWindowsSnapshot(result, new Date().toISOString(), capabilityProfile);
}
module.exports = { scanWindows };
