const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeIdentity } = require('../shared/emarker.cjs');
const { parseMacIdentities } = require('../electron/collectors/macos.cjs');
const words = (vdo, type = 3) => [(type << 27) >>> 0, 0, 0, vdo >>> 0];
const cableVdo = (speed = 2) => ((2 << 18) | (1 << 13) | (2 << 5) | speed) >>> 0;

test('50V / 5A with EPR is 240W, never 250W', () => {
  const c = decodeIdentity(words(cableVdo() | (3 << 9) | (1 << 17)));
  assert.equal(c.ratingVoltageV, 50); assert.equal(c.operationalVoltageV, 48); assert.equal(c.maxPowerW, 240);
});
test('50V without EPR does not establish 240W capability', () => {
  const c = decodeIdentity(words(cableVdo() | (3 << 9)));
  assert.equal(c.maxPowerW, null); assert.equal(c.epr, false);
});
test('30V and 40V rating fields are not collapsed into 20V or used as charging voltages',()=>{
  for(const [bits,volts] of [[1,30],[2,40]]) {const c=decodeIdentity(words(cableVdo()|(bits<<9)));assert.equal(c.ratingVoltageV,volts);assert.equal(c.maxPowerW,null);}
});
test('unknown current and speed stay unknown rather than becoming 3A or USB2', () => {
  const c = decodeIdentity(words((2 << 18) | 7));
  assert.equal(c.ratingCurrentA, null); assert.equal(c.maxPowerW, null); assert.equal(c.dataLabel, null); assert.equal(c.kind, 'unknown');
});
test('VCONN-powered devices are not decoded as cable identities', () => {
  assert.equal(decodeIdentity(words(cableVdo(), 6)), null);
  assert.equal(decodeIdentity([]), null);
});
test('two cables on different registry entries remain separate even if local port numbers match', () => {
  const vdos = words(cableVdo()).map(n => { const b=Buffer.alloc(4);b.writeUInt32LE(n);return b; });
  const tree = [1,2].map(id => ({ IORegistryEntryID: id, ParentPortNumber: 0, 'Specification Revision': 3, Metadata: { VDOs: vdos } }));
  const cables = parseMacIdentities(tree); assert.equal(cables.length,2); assert.notEqual(cables[0].id,cables[1].id); assert.equal(cables[0].ratingCurrentA,5);
});
test('a high wattage or vendor id never proves a proprietary charging protocol', async () => {
  const { brands, compatibility } = await import('../shared/brands.mjs');
  const c = decodeIdentity(words(cableVdo() | (3 << 9) | (1 << 17)));
  for(const b of brands.filter(b => b.mode === 'private')) assert.equal(compatibility(c,b).state,'unknown');
  assert.equal(compatibility(c,brands[0]).state,'conditional');
});
test('unknown system connection cannot pass a brand cable requirement', async () => {
  const { brands, compatibility } = await import('../shared/brands.mjs');
  for(const b of brands) assert.equal(compatibility({ evidence:'connection',ratingCurrentA:null },b).state,'unknown');
});
test('3A only fails the selected Samsung 45W cable rule, not all charging', async () => {
  const { brands, compatibility } = await import('../shared/brands.mjs');
  const c = decodeIdentity(words((2 << 18) | (1 << 13) | (1 << 5)));
  const result = compatibility(c,brands.find(b => b.id==='samsung'));
  assert.equal(result.state,'limited'); assert.match(result.detail,/其他充电档位/);
});
