const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createCompatibilityChecker}=require('../electron/compatibility-check.cjs');
async function profile() {
  const root=path.resolve(__dirname,'../test-results/compatibility-unit');await fs.mkdir(root,{recursive:true});
  return fs.mkdtemp(path.join(root,'profile-'));
}
const pending=dir=>path.join(dir,'compatibility-pending.json');
test('a cancelled new UAC request clears only its own pending job',async()=>{
  const dir=await profile();let calls=0;
  const check=createCompatibilityChecker(async()=>{calls++;return {stdout:'{"cancelled":true}'};});
  assert.deepEqual(await check(dir),{cancelled:true,restored:true});
  assert.equal(calls,1);await assert.rejects(fs.access(pending(dir)));
});
test('a timed out helper retains its recovery job and blocks a competing new check',async()=>{
  const dir=await profile();let calls=0;
  const check=createCompatibilityChecker(async()=>{calls++;throw new Error('simulated timeout');});
  assert.equal((await check(dir)).restored,false);
  const before=await fs.readFile(pending(dir),'utf8');
  assert.equal((await check(dir)).restored,false);assert.equal(calls,1);
  assert.equal(await fs.readFile(pending(dir),'utf8'),before);
});
test('a damaged pending record is preserved and cannot start another elevated job',async()=>{
  const dir=await profile();await fs.writeFile(pending(dir),'{broken');
  const check=createCompatibilityChecker(async()=>{assert.fail('must not launch');});
  assert.equal((await check(dir)).restored,false);
  assert.equal(await fs.readFile(pending(dir),'utf8'),'{broken');
});
test('an unverified restore never caches a result; a verified retry clears the pending job',async()=>{
  const dir=await profile();let restored=false;
  const check=createCompatibilityChecker(async(_exe,args)=>{
    const job=args[args.indexOf('-JobDirectory')+1];
    await fs.writeFile(path.join(job,'report.json'),JSON.stringify({restored,error:restored?null:'simulated restore failure'}));
    return {stdout:'{"cancelled":false,"exitCode":0}'};
  });
  assert.equal((await check(dir)).restored,false);
  await fs.access(pending(dir));await assert.rejects(fs.access(path.join(dir,'computer-capabilities.json')));
  restored=true;assert.deepEqual(await check(dir,{restore:true}),{restored:true,restorationOnly:true});
  await assert.rejects(fs.access(pending(dir)));
});
test('a complete restored report persists only the assessed computer capability',async()=>{
  const dir=await profile();const fingerprint='a'.repeat(64);
  const check=createCompatibilityChecker(async(_exe,args)=>{
    const job=args[args.indexOf('-JobDirectory')+1];
    const report={restored:true,hostFingerprint:fingerprint,finishedAt:new Date().toISOString(),native:{controllers:[{Responses:[
      {Name:'GET_CAPABILITY',Control:'6',IoctlSuccess:true,Returned:48,Version:288,Cci:0x80001000,Data:[68,64,0,0,2,0,0,0,0,0,0,0,0,0,0,0]}
    ]}]}};
    await fs.writeFile(path.join(job,'report.json'),JSON.stringify(report));
    return {stdout:'{"cancelled":false,"exitCode":0}'};
  });
  const result=await check(dir);assert.equal(result.restored,true);assert.equal(result.profile.state,'firmware-limited');
  assert.deepEqual(result.records,[]);
  const saved=JSON.parse(await fs.readFile(path.join(dir,'computer-capabilities.json'),'utf8'));
  assert.equal(saved.hostFingerprint,fingerprint);assert.equal(saved.state,'firmware-limited');assert.equal(saved.native,undefined);
  await assert.rejects(fs.access(pending(dir)));
});
