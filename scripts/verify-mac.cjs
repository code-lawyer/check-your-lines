// Run on a physical Mac. A passing app flow without a connected cable does not
// establish e-marker support; the report states that distinction explicitly.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
async function main() {
  if(process.platform!=='darwin') throw new Error('This acceptance script requires macOS. No checks were run.');
  const root=path.resolve(__dirname,'..');
  execFileSync('npm',['test'],{cwd:root,stdio:'inherit'});
  execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit'});
  execFileSync(process.execPath,['tests/catalog-smoke.cjs'],{cwd:root,stdio:'inherit'});
  execFileSync(process.execPath,['tests/recovery-smoke.cjs'],{cwd:root,stdio:'inherit'});
  const scan=await require('../electron/collectors/macos.cjs').scanMac();
  const report={version:require('../package.json').version,checkedAt:new Date().toISOString(),os:os.release(),arch:process.arch,
    appFlow:'passed',chipRecords:scan.cables.length,chipRead:scan.cables.length?'observed':'not-observed',
    // Deliberately omit device identities/serials from a shareable acceptance report.
    observations:scan.cables.map(c=>({evidence:c.evidence,power:c.maxPowerW,current:c.ratingCurrentA,voltage:c.ratingVoltageV,data:c.dataLabel,warnings:c.warnings})),
    manualChecksRemaining:['Compare reported values against known cable markings','Check unplug/replug and a single-ended cable','Check two cables on separate ports','Verify signed/notarized release on a second Mac']};
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  const target=path.join(root,'test-results/mac-validation.json');
  await fs.writeFile(target,JSON.stringify(report,null,2));console.log(target);console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
