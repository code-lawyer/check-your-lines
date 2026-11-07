const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildWindowsSnapshot } = require('../shared/windows-snapshot.cjs');

// Captured topology of the user's laptop: one phone + three integrated USB devices.
// IDs are synthetic; connector/removal flags and speeds are the actual observations.
const phone = { id: 'phone', name: 'Xiaomi 15', userConnectable: true, hostConnectorTypeC: true, hubPath: 'root-hub', portNumber: 2, speed: '480 Mbps', location: 'Hub 2 / Port 2' };
const internal = [
  { id: 'integrated-component', name: 'USB 多功能设备', userConnectable: false, portNumber: 5 },
  { id: 'camera', name: 'USB 多功能设备', userConnectable: false, portNumber: 8 },
  { id: 'bluetooth', name: 'Intel 无线 Bluetooth', userConnectable: false, portNumber: 10 }
];
test('one external cable is not inflated by three integrated USB devices', () => {
  const s = buildWindowsSnapshot({ devices: [phone, ...internal] });
  assert.equal(s.cables.length, 1);
  assert.equal(s.cables[0].deviceName, 'Xiaomi 15');
  assert.equal(s.cables[0].connectionScope, 'external');
  assert.match(s.cables[0].connector, /电脑端 USB-C/);
  assert.equal(s.cables[0].ratingVoltageV, null);
  assert.equal(s.cables[0].maxPowerW, null);
  assert.equal(s.cables[0].dataLabel, null);
  assert.equal(s.cables[0].currentSpeedLabel, '480 Mbps');
  assert.equal(s.diagnostics.internalDevices.length, 3);
  assert.equal(buildWindowsSnapshot({ devices: internal }).cables.length, 0);
});
test('classification uses hardware metadata, not a device-name blacklist', () => {
  const s = buildWindowsSnapshot({ devices: [
    {...phone, id: 'external-camera', name: 'Integrated Camera'},
    {...phone, id: 'external-bt', name: 'Intel 无线 Bluetooth', portNumber: 3}
  ] });
  assert.equal(s.cables.length, 2);
});
test('unknown topology stays separate; missing flags never imply an internal device', () => {
  const s = buildWindowsSnapshot({ devices: [
    { id: 'legacy-removable', name: '设备', removable: true },
    { id: 'legacy-internal', name: '设备', removable: false, containerId: '{00000000-0000-0000-FFFF-FFFFFFFFFFFF}' },
    { id: 'unknown', name: '设备' }
  ] });
  assert.deepEqual(s.cables.map(c => c.id), ['legacy-removable']);
  assert.equal(s.diagnostics.internalDevices.length, 1);
  assert.equal(s.diagnostics.unclassifiedDevices.length, 1);
});
test('duplicate functions on the same physical port are counted once', () => {
  const s = buildWindowsSnapshot({ devices: [phone, { ...phone, id: 'phone-function' }] });
  assert.equal(s.cables.length, 1);
  assert.equal(s.diagnostics.duplicateCount, 1);
});
test('a confirmed external data connection gets a useful recommendation without saving first', async () => {
  const { recommendUses } = await import('../shared/recommendations.mjs');
  const c = buildWindowsSnapshot({ devices: [phone] }).cables[0];
  assert.equal(recommendUses(c).primary.id, 'data');
  assert.equal(recommendUses(c).items.find(x => x.id === 'phone').state, 'unknown');
  assert.equal(recommendUses(c).items.find(x => x.id === 'fast-data').state, 'unknown');
});
