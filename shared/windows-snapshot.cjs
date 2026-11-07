// Keep physical-port evidence separate from USB device identity. A device ID is
// not a unique cable ID, and current link speed is not a cable's rated maximum.
function classifyDevice(d) {
  if (d.userConnectable === true) return 'external';
  if (d.userConnectable === false) return 'internal';
  if (d.removable === true) return 'external';
  if (d.removable === false && String(d.containerId).toLowerCase() === '{00000000-0000-0000-ffff-ffffffffffff}') return 'internal';
  return 'unknown';
}
function buildWindowsSnapshot(result, scannedAt = new Date().toISOString(), capabilityProfile = null) {
  const profile = require('./ucsi.cjs').applicableCapabilityProfile(capabilityProfile, result.ucsi?.hostFingerprint);
  const cables = [], internalDevices = [], unclassifiedDevices = [], seen = new Set();
  let duplicateCount = 0;
  for (const d of result.devices || []) {
    const scope = classifyDevice(d);
    const summary = { name: d.name || 'USB 设备', location: d.location || null, reason: d.userConnectable === false ? '系统标记为内置端口' : scope === 'internal' ? '设备属于电脑的内置容器' : '系统未提供可确认的端口属性' };
    if (scope === 'internal') { internalDevices.push(summary); continue; }
    if (scope === 'unknown') { unclassifiedDevices.push(summary); continue; }
    const key = d.hubPath && d.portNumber ? `${d.hubPath.toLowerCase()}:${d.portNumber}` : d.id;
    if (seen.has(key)) { duplicateCount++; continue; }
    seen.add(key);
    const hostConnector = d.hostConnectorTypeC === true ? 'USB-C' : null;
    cables.push({
      id: d.id, name: d.name === 'USB Composite Device' ? 'USB 多功能设备' : d.name || 'USB 设备连接',
      deviceName: d.name, presence: 'device', connectionScope: 'external',
      portLabel: `外接连接 ${cables.length + 1}`, connector: hostConnector ? `电脑端 ${hostConnector} · 另一端待确认` : '接口外形未上报',
      hostConnector, evidence: 'connection', sourceLabel: 'Windows 外接 USB 连接',
      kind: 'data', ratingCurrentA: null, ratingVoltageV: null, operationalVoltageV: null, maxPowerW: null,
      dataLabel: null, currentSpeedLabel: d.speed || null, warnings: [],
      note: '已确认位于外接端口且可进行 USB 数据通信。当前连接速率由线材、端口和设备共同决定，不能作为线材的额定上限。',
      location: d.location || null,
      specReadState: profile ? 'host-unsupported' : 'not-read',
      powerEvidence: profile ? profile.reason : '电脑的 USB 连接信息不包含线材额定功率；需要线材芯片或厂商规格才能确认。'
    });
  }
  const ucsi = result.ucsi || { controllers: [], state: result.ucsiPresent ? 'disabled' : 'absent' };
  if (profile) ucsi.compatibility = profile;
  const countMessage = cables.length ? `已确认 ${cables.length} 个外接 USB 连接` : '尚未发现外接 USB 数据连接';
  return {
    platform: 'Windows', cables, scannedAt,
    diagnostics: { internalDevices, unclassifiedDevices, duplicateCount, ucsi },
    capabilities: {
      singleEnded: 'unavailable', emarker: profile ? 'unsupported' : 'unavailable', nativeCollector: 'Windows USB port properties / PnP',
      message: `${countMessage}${internalDevices.length ? `，已排除 ${internalDevices.length} 个内置设备` : ''}。${profile ? '经兼容性检查，这台电脑未开放线材额定规格读取；可继续查看数据连接并记录已知规格。' : '连接信息可确认数据通信，额定充电规格需额外的线材信息读取通道。'}`,
      ucsiPresent: Boolean(result.ucsiPresent || ucsi.controllers?.length), warnings: result.warnings || []
    }
  };
}
module.exports = { classifyDevice, buildWindowsSnapshot };
