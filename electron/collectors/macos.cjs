const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const plist = require('plist');
const { decodeIdentity } = require('../../shared/emarker.cjs');
const execute = promisify(execFile);

function flatten(nodes) {
  return (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean).flatMap(n => [n, ...flatten(n.IORegistryEntryChildren || [])]);
}
function parseMacIdentities(tree) {
  const seen = new Set();
  return flatten(tree).flatMap((node, index) => {
    const meta = node.Metadata || {};
    const blobs = meta.VDOs || node.VDOs || [];
    const words = blobs.map(b => Buffer.isBuffer(b) && b.length === 4 ? b.readUInt32LE(0) : null);
    if (words.some(x => x === null)) return [];
    const decoded = decodeIdentity(words, Number(node['Specification Revision'] ?? 0));
    if (!decoded) return [];
    const entryId = String(node.IORegistryEntryID ?? `identity-${index}`);
    if (seen.has(entryId)) return [];
    seen.add(entryId);
    const port = node.ParentBuiltInPortNumber ?? node.ParentPortNumber;
    // Entry IDs are session identifiers. Never advertise a chip VID/PID as
    // a unique physical cable ID, nor merge multiple controllers by port number.
    return [{ ...decoded, id: `mac-${entryId}`, name: 'USB-C 线材', presence: 'cable',
      portLabel: port === undefined ? 'USB-C 连接' : `USB-C 端口 ${port}`,
      sourceLabel: '线材芯片声明', note: '已读取芯片信息。实际质量和品牌私有快充仍需确认。',
      deviceName: null }];
  });
}
async function scanMac(run = execute) {
  const { stdout } = await run('/usr/sbin/ioreg', ['-a', '-l', '-r', '-c', 'IOPortTransportComponentCCUSBPDSOPp'], { timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
  // ioreg can exit successfully with no output when this registry class has
  // no matching entries. Only that empty result is normal; malformed XML and
  // command failures must still surface instead of pretending no cable exists.
  const cables = stdout.trim() ? parseMacIdentities(plist.parse(stdout)) : [];
  return { platform: 'macOS', cables, capabilities: {
    singleEnded: 'conditional', emarker: 'conditional', nativeCollector: 'IORegistry',
    message: cables.length
      ? '已读取 Mac 开放的线材芯片信息。未出现的线可先换 USB-C 端口，或将另一端接入设备后重试。'
      : '未读取到线材芯片信息。可尝试换 USB-C 端口、接入另一端设备，或手动登记线材；空结果不能确认线材是否带芯片。'
  }, scannedAt: new Date().toISOString() };
}
module.exports = { scanMac, parseMacIdentities };
