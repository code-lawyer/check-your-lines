export const catalogVersion = 3;
export const maxCatalogRecords = 500;
export const maxCatalogBytes = 100 * 1024 * 1024;
const allowedConnectors = ['USB-C ↔ USB-C', 'USB-A ↔ USB-C', 'USB-A ↔ Micro-USB', 'USB-C ↔ Lightning', 'USB-A ↔ Lightning'];
const allowedSpeeds = ['12 Mbps', '480 Mbps', '5 Gbps', '10 Gbps', '20 Gbps', '40 Gbps', '80 Gbps'];
export function validPhoto(value) { return typeof value === 'string' && value.length <= 180000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value); }
function boundedText(value, max, fallback = '') { return typeof value === 'string' ? value.slice(0, max) : fallback; }
function positive(value, max) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : null; }
export function normalizeRecord(input) {
  if (!input || typeof input !== 'object' || typeof input.id !== 'string' || !input.id || typeof input.name !== 'string' || !input.name.trim()) throw new Error('记录缺少名称或编号');
  const c = {
    id: boundedText(input.id, 120), name: input.name.trim().slice(0, 80),
    portLabel: boundedText(input.portLabel, 200, '手动登记'), connector: boundedText(input.connector, 100, '接口类型待确认'),
    evidence: ['emarker','controller','connection','manual'].includes(input.evidence) ? input.evidence : 'manual',
    presence: ['cable','device','manual'].includes(input.presence) ? input.presence : 'manual',
    sourceLabel: boundedText(input.sourceLabel, 200, '用户记录'), kind: ['data','power-only'].includes(input.kind) ? input.kind : 'unknown',
    ratingCurrentA: positive(input.ratingCurrentA, 20), ratingVoltageV: positive(input.ratingVoltageV, 60),
    operationalVoltageV: positive(input.operationalVoltageV, 60), maxPowerW: positive(input.maxPowerW, 500),
    dataLabel: boundedText(input.dataLabel, 100) || null, currentSpeedLabel: boundedText(input.currentSpeedLabel, 100) || null,
    warnings: Array.isArray(input.warnings) ? input.warnings.slice(0,20).map(v => boundedText(v,500)) : [],
    note: boundedText(input.note, 2000), demo: Boolean(input.demo)
  };
  for (const key of ['inventoryId','originId','deviceName','location','savedAt','updatedAt','speedNote','hostConnector','powerEvidence']) if (typeof input[key] === 'string') c[key] = input[key].slice(0,500);
  if (['external','internal','unknown'].includes(input.connectionScope)) c.connectionScope = input.connectionScope;
  if (['host-unsupported','not-read'].includes(input.specReadState)) c.specReadState = input.specReadState;
  for (const key of ['epr','activeCable']) if (typeof input[key] === 'boolean') c[key] = input[key];
  if (Array.isArray(input.rawVdos)) c.rawVdos = input.rawVdos.slice(0,10).map(v => boundedText(v,30));
  if (typeof input.color === 'string' && /^#[a-f\d]{6}$/i.test(input.color)) c.color = input.color;
  c.storageLocation = boundedText(input.storageLocation,120);
  c.userNote = boundedText(input.userNote,2000);
  if (input.photoDataUrl) { if (!validPhoto(input.photoDataUrl)) throw new Error('照片格式不支持或尺寸过大'); c.photoDataUrl = input.photoDataUrl; }
  if (input.recordedSpecs && typeof input.recordedSpecs === 'object') {
    const s = input.recordedSpecs; c.recordedSpecs = {};
    if (allowedConnectors.includes(s.connector)) c.recordedSpecs.connector = s.connector;
    if (['data','power-only'].includes(s.kind)) c.recordedSpecs.kind = s.kind;
    if (allowedSpeeds.includes(s.dataLabel)) c.recordedSpecs.dataLabel = s.dataLabel;
    for (const [key, max] of [['maxPowerW',500], ['ratingCurrentA',20], ['ratingVoltageV',60]]) if (positive(s[key], max)) c.recordedSpecs[key] = s[key];
    if (typeof s.epr === 'boolean') c.recordedSpecs.epr = s.epr;
    c.recordedSpecs.sourceNote = boundedText(s.sourceNote,500);
    if (c.recordedSpecs.kind === 'power-only' && c.recordedSpecs.dataLabel) throw new Error('仅供电与数据速度互相矛盾，请先核对');
    const kind = c.recordedSpecs.kind || c.kind;
    const data = c.recordedSpecs.dataLabel || c.dataLabel;
    if (kind === 'power-only' && (data || c.kind === 'data')) throw new Error('仅供电与已有数据通信信息矛盾，请核对原记录');
    const watts = c.recordedSpecs.maxPowerW || c.maxPowerW;
    const amps = c.recordedSpecs.ratingCurrentA || c.ratingCurrentA;
    const volts = c.recordedSpecs.ratingVoltageV || c.ratingVoltageV;
    if (watts && amps && volts && watts > amps * volts + 0.01) throw new Error('功率超过填写的电压与电流上限，请核对规格');
  }
  return c;
}
export function normalizeCatalog(records) {
  if (!Array.isArray(records)) throw new Error('清单格式不正确');
  if (records.length > maxCatalogRecords) throw new Error(`本版最多保存 ${maxCatalogRecords} 根线材，请分批备份`);
  const result = records.map(normalizeRecord);
  if (new Set(result.map(c => c.id)).size !== result.length) throw new Error('清单中存在重复编号');
  return result;
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > maxCatalogBytes) throw new Error('备份过大');
  const data = JSON.parse(text);
  if (data.app !== 'Cablewise' || !Array.isArray(data.records)) throw new Error('请选择 Cablewise 导出的 JSON 文件');
  if (data.catalogVersion && data.catalogVersion > catalogVersion) throw new Error('备份版本较新，请更新应用后导入');
  return normalizeCatalog(data.records);
}
