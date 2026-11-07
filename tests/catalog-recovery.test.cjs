const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createCatalogStore}=require('../electron/catalog-store.cjs');
const record={id:'recovery-fixture',name:'备份中的线材',evidence:'manual',presence:'manual',kind:'unknown',photoDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4f8AAAAASUVORK5CYII='};
async function fixture() {
  const root=path.resolve(__dirname,'../test-results/recovery-unit');await fs.mkdir(root,{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'profile-')),store=createCatalogStore(dir);
  await store.save([record]);await store.save([{...record,name:'较新记录'}]);
  const file=path.join(dir,'cable-catalog.json');await fs.writeFile(file,'{"damaged":');
  return {dir,store,file};
}
test('explicit backup recovery retains the damaged original, photos and valid backup',async()=>{
  const {dir,store,file}=await fixture();await assert.rejects(store.load());
  const original=await fs.readFile(file,'utf8'),backup=await fs.readFile(file+'.bak','utf8');
  assert.equal((await store.recoveryInfo()).records,1);
  const restored=await store.recover({source:'backup'});
  assert.equal(restored.records[0].name,record.name);assert.equal(restored.records[0].photoDataUrl,record.photoDataUrl);assert.equal(restored.originalPreserved,true);
  assert.equal((await createCatalogStore(dir).load()).records[0].name,record.name);
  const copies=await fs.readdir(path.join(dir,'recovery'));assert.equal(copies.length,1);
  assert.equal(await fs.readFile(path.join(dir,'recovery',copies[0]),'utf8'),original);
  assert.equal(await fs.readFile(file+'.bak','utf8'),backup);
});
test('invalid imported data and an unreadable backup cannot overwrite a damaged catalog',async()=>{
  const {store,file}=await fixture();const original=await fs.readFile(file,'utf8');
  await assert.rejects(store.recover({source:'import',records:[{...record,name:''}]}));
  assert.equal(await fs.readFile(file,'utf8'),original);
  await fs.writeFile(file+'.bak','{broken backup');
  assert.equal((await store.recoveryInfo()).available,false);
  await assert.rejects(store.recover({source:'backup'}));assert.equal(await fs.readFile(file,'utf8'),original);
  assert.equal((await store.recover({source:'import',records:[record]})).records[0].photoDataUrl,record.photoDataUrl);
});
test('a stale recovery action cannot overwrite a catalog that became readable',async()=>{
  const {store}=await fixture();await store.save([{...record,name:'已经修复的新记录'}]);
  await assert.rejects(store.recover({source:'import',records:[record]}),/重新读取/);
  assert.equal((await store.load()).records[0].name,'已经修复的新记录');
});
test('a missing main file with a backup is recoverable and is not mistaken for a new catalog',async()=>{
  const {store,file}=await fixture();await fs.unlink(file);
  await assert.rejects(store.load(),/备份/);
  const result=await store.recover({source:'backup'});
  assert.equal(result.records[0].name,record.name);assert.equal(result.originalPreserved,false);
});
