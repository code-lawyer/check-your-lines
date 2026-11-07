const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCatalogStore } = require('../electron/catalog-store.cjs');
const blank = { id: 'test-1', inventoryId: 'CW-TEST', name: '白色短线', connector: '接口类型待确认', presence: 'manual', evidence: 'manual', kind: 'unknown', ratingCurrentA: null, ratingVoltageV: null, maxPowerW: null, dataLabel: null, warnings: [] };
const known = { ...blank, evidence: 'emarker', presence: 'cable', connector: 'USB-C ↔ USB-C', ratingCurrentA: 3, ratingVoltageV: 20, maxPowerW: 60, kind: 'data', dataLabel: '480 Mbps' };
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4f8AAAAASUVORK5CYII=';

test('unknown cables do not default to mouse charging or data recommendations', async () => {
  const { recommendUses } = await import('../shared/recommendations.mjs');
  const r = recommendUses(blank); assert.equal(r.primary, null); assert(r.items.every(i => i.state === 'unknown'));
});
test('a high-power USB2 cable is a charging candidate, not a high speed data cable', async () => {
  const { recommendUses } = await import('../shared/recommendations.mjs');
  const r = recommendUses({...known, maxPowerW:240, ratingCurrentA:5, ratingVoltageV:50,epr:true});
  assert.equal(r.primary.id,'laptop'); assert.equal(r.items.find(i=>i.id==='fast-data').state,'limited'); assert.equal(r.items.find(i=>i.id==='data').state,'match');
});
test('connection speed is not used as a declared cable maximum', async () => {
  const { recommendUses } = await import('../shared/recommendations.mjs');
  const r=recommendUses({...blank, presence:'device', evidence:'connection',kind:'data',currentSpeedLabel:'10 Gbps'});
  assert.equal(r.items.find(i=>i.id==='fast-data').state,'unknown'); assert.equal(r.items.find(i=>i.id==='data').state,'match');
  assert.equal(recommendUses({...known,presence:'device',inventoryId:undefined}).primary,null);
});
test('charge-only is distinct from wired input, and no EPR means no 240W recommendation', async () => {
  const { recommendUses } = await import('../shared/recommendations.mjs');
  const r=recommendUses({...known, kind:'power-only',dataLabel:null});
  assert.equal(r.items.find(i=>i.id==='peripheral-charge').state,'conditional'); assert.equal(r.items.find(i=>i.id==='peripheral-data').state,'limited');
  assert.equal(recommendUses({...known,maxPowerW:240,epr:undefined}).items.find(i=>i.id==='laptop').state,'unknown');
});
test('manual specifications preserve the original facts and label their provenance', async () => {
  const { recommendUses, cableFacts } = await import('../shared/recommendations.mjs');
  const c={...blank,recordedSpecs:{connector:'USB-C ↔ USB-C',kind:'data',dataLabel:'10 Gbps',maxPowerW:60}};
  const r=recommendUses(c);assert.equal(r.primary.id,'travel');assert.match(r.source,/用户补充/);assert.equal(c.maxPowerW,null);assert.equal(cableFacts(c).maxPowerW,60);
});
test('ambiguous labels and warnings remain conservative', async () => {
  const { recommendUses } = await import('../shared/recommendations.mjs');
  assert.equal(recommendUses({...known,dataLabel:'USB4 · 20/40 Gbps 等级'}).items.find(i=>i.id==='fast-data').state,'unknown');
  assert.equal(recommendUses({...known,warnings:['不一致']}).primary,null);
});
test('JSON photo roundtrip, HTML escaping and CSV formula neutralization', async () => {
  const { buildExport }=await import('../shared/exports.mjs'); const { parseBackup }=await import('../shared/catalog.mjs');
  const c={...known,name:'=HYPERLINK("x")',photoDataUrl:photo,userNote:'<script>alert(1)</script>',demo:true};
  const restored=parseBackup(buildExport([c])); assert.equal(restored[0].photoDataUrl,photo);assert.equal(restored[0].demo,true);
  const html=buildExport([c],'html');assert(html.includes(photo));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
  assert(buildExport([c],'csv').includes('"\'=HYPERLINK'));assert(buildExport([c],'csv').includes('CSV 不含照片'));
});
test('unsafe photos, duplicates and inconsistent manual specs cannot enter the catalog', async () => {
  const { normalizeCatalog }=await import('../shared/catalog.mjs');
  assert.throws(()=>normalizeCatalog([{...blank,photoDataUrl:'data:image/svg+xml;base64,AAAA'}]));
  assert.throws(()=>normalizeCatalog([blank,blank]));
  assert.throws(()=>normalizeCatalog([{...known,recordedSpecs:{kind:'power-only'}}]));
  assert.throws(()=>normalizeCatalog([{...known,recordedSpecs:{maxPowerW:240}}]));
});
test('catalog survives reopening; invalid writes do not erase valid records; backup is recoverable', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cablewise-catalog-test-'));
  const store=createCatalogStore(dir); assert.equal((await store.load()).records,null);
  await store.save([{...known,photoDataUrl:photo}]);
  const reopened=createCatalogStore(dir);assert.equal((await reopened.load()).records[0].photoDataUrl,photo);
  await assert.rejects(reopened.save([{...blank,name:''}]));assert.equal((await reopened.load()).records[0].name,known.name);
  await reopened.save([{...known,name:'新名称',photoDataUrl:photo}]);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'cable-catalog.json.bak'),'utf8')).records[0].name,known.name);
  // Leave only isolated OS-temp test artifacts; never touch normal application data.
});
