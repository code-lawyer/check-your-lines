const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { assessNativeUcsiReport, cableRecordsFromNative } = require('../shared/ucsi.cjs');
const execute = promisify(execFile);
const native = path.join(__dirname, 'native').replace('app.asar', 'app.asar.unpacked');
function createCompatibilityChecker(run = execute) {
return async function checkComputer(userData, { restore = false } = {}) {
  const pendingPath = path.join(userData, 'compatibility-pending.json');
  let pending;
  try { pending = JSON.parse(await fs.readFile(pendingPath, 'utf8')); }
  catch(error) {if(error.code!=='ENOENT') return {restored:false,error:'上一次诊断的恢复记录无法读取，未开始新的检查。请保留记录以便恢复。'};}
  if (pending && !restore) return { restored: false, error: '上一次检查尚未确认恢复。请先点击恢复设置。' };
  const id = restore ? pending?.id : randomUUID();
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) return { restored: false, error: '没有可恢复的有效诊断记录。' };
  const jobDirectory = path.join(userData, 'compatibility-checks', id);
  await fs.mkdir(jobDirectory, { recursive: true });
  await fs.writeFile(pendingPath, JSON.stringify({ id }), 'utf8');
  const ps7 = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
  let exe = ps7;
  try { await fs.access(ps7); } catch { exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); }
  let launched;
  try {
    const result = await run(exe, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(native,'launch-compatibility.ps1'),'-JobDirectory',jobDirectory,...(restore?['-RestoreOnly']:[])], { windowsHide:true,timeout:120000,maxBuffer:2*1024*1024,encoding:'utf8' });
    launched = JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());
  } catch {
    // Keep the recovery record: a timed-out elevated helper may still be restoring.
    return { restored:false,error:'兼容性检查未正常结束。恢复记录已保留，请点击恢复设置确认系统已还原。' };
  }
  if (launched.cancelled) { if(!restore) await fs.rm(pendingPath,{force:true}); return {cancelled:true,restored:!restore}; }
  let report;
  try { report = JSON.parse(await fs.readFile(path.join(jobDirectory,'report.json'),'utf8')); }
  catch { return {restored:false,error:'未收到完整诊断结果。恢复记录已保留，请先恢复设置。'}; }
  if (report.restored !== true) return {restored:false,error:report.error || '系统设置尚未确认恢复，请先恢复设置。'};
  await fs.rm(pendingPath,{force:true});
  if (report.error) return {restored:true,error:report.error};
  if (restore) return {restored:true,restorationOnly:true};
  const profile = assessNativeUcsiReport(report);
  if (profile.state !== 'inconclusive') {
    const target=path.join(userData,'computer-capabilities.json');
    await fs.writeFile(target+'.tmp',JSON.stringify(profile,null,2),'utf8');await fs.rename(target+'.tmp',target);
  }
  return {restored:true,profile,records:cableRecordsFromNative(report)};
};
}
module.exports = {checkComputer:createCompatibilityChecker(),createCompatibilityChecker};
