const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('recovery retains unverified work across missing logs, partial failures and retries', {skip:process.platform!=='win32'}, () => {
  // Only pure transaction helpers execute. No UAC, registry or device calls.
  const exe=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const stdout=execFileSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'compatibility-state.ps1')],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.match(stdout,/PASS recovery journal/);
});
