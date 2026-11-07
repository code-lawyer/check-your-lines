// Product sorting rules, not USB certification or a promise about a whole device setup.
export const usageRulesVersion = '2026-11-06.1';
export const usageSources = [
  { title: 'USB-IF：功率与数据标识', url: 'https://usb.org/sites/default/files/usb_type-c_cable_logo_usage_guidelines_jan26_final.pdf' },
  { title: 'Apple：充电与数据连接', url: 'https://support.apple.com/en-us/105099' },
  { title: 'Logitech：鼠标充电与连接', url: 'https://support.logi.com/hc/en-nz/articles/8335872639767-Getting-Started-MX-Master-3S-for-Mac' }
];
export const usageRules = [
  { id: 'phone', title: '主力手机充电', criteria: '优先 USB-C 双头、标称至少 30W 的线。', explanation: '30W 是本工具的整理门槛，不是所有手机的快充要求。仍需匹配机型、协议和充电器；品牌专属快充单独确认。' },
  { id: 'laptop', title: '笔记本充电', criteria: '优先 USB-C 双头、标称至少 60W；超过 100W 还需明确 EPR 声明。', explanation: '60W 是起始分类门槛。线材功率需覆盖电脑的目标档位，并匹配 USB PD 充电器。' },
  { id: 'data', title: '普通文件传输', criteria: '已确认具备数据能力。USB 2.0 的 480 Mbps 也属于可传数据。', explanation: '适合文档、少量照片等；连接成功只说明本次可通信，不证明最高速度。' },
  { id: 'fast-data', title: '高速硬盘 / 大文件传输', criteria: '具备数据能力，且声明的数据等级至少 5 Gbps。', explanation: '5 Gbps 是本工具的高速分类门槛。实际速度受端口、设备和存储介质共同限制，不是文件复制速度保证。' },
  { id: 'peripheral-charge', title: '鼠标 / 键盘充电', criteria: '已知额定电压至少 5V、额定电流至少 1A，并确认接口。', explanation: '用于满足 5V、1A 以内要求的小设备的充电候选；按设备说明核对。无需因此要求高速数据能力。' },
  { id: 'peripheral-data', title: '鼠标 / 键盘有线连接', criteria: '已确认具备数据能力，并与设备接口匹配。', explanation: '设备本身必须支持有线通信；仅供电线不能用于有线输入，部分无线设备的 USB 口只用于充电。' },
  { id: 'travel', title: '出行多用途主力', criteria: 'USB-C 双头、至少 60W，且数据声明至少 5 Gbps。', explanation: '同时覆盖充电与高速数据需求的候选；不因此推断支持显示器、雷电或所有品牌快充。' }
];

export function cableFacts(cable) {
  const specs = cable.recordedSpecs || {};
  const facts = { ...cable };
  for (const key of ['connector', 'kind', 'maxPowerW', 'ratingCurrentA', 'ratingVoltageV', 'dataLabel', 'epr']) {
    if (specs[key] !== undefined && specs[key] !== null && specs[key] !== '') facts[key] = specs[key];
  }
  facts.hasRecordedSpecs = Object.keys(specs).some(k => k !== 'sourceNote');
  return facts;
}

export function declaredMbps(label) {
  // Preserve ambiguous USB4 version-dependent labels instead of choosing a maximum.
  if (typeof label !== 'string' || label.includes('/')) return null;
  const match = label.match(/^(?:USB\d?\s*·\s*)?(\d+(?:\.\d+)?)\s*(Mbps|Gbps)(?:\s*等级)?$/i);
  return match ? Number(match[1]) * (match[2].toLowerCase() === 'gbps' ? 1000 : 1) : null;
}

export function recommendUses(cable) {
  const c = cableFacts(cable);
  const speed = declaredMbps(c.dataLabel);
  const power = Number.isFinite(c.maxPowerW) && c.maxPowerW > 0 ? c.maxPowerW : null;
  const cc = c.connector === 'USB-C ↔ USB-C';
  const connectorKnown = /^(USB-C ↔ USB-C|USB-A ↔ USB-C|USB-A ↔ Micro-USB|USB-C ↔ Lightning|USB-A ↔ Lightning)$/.test(c.connector);
  const source = c.hasRecordedSpecs ? '包含用户补充规格，未作为自动检测结果' : c.evidence === 'emarker' ? '根据线材芯片声明' : c.evidence === 'controller' ? '根据系统控制器上报的线材属性' : c.evidence === 'connection' ? c.savedAt ? '根据保存时的设备连接' : '根据当前外接设备连接' : '根据当前记录';
  const unconfirmedDevice = c.presence === 'device' && c.connectionScope !== 'external' && !c.inventoryId;
  const blocked = unconfirmedDevice || (c.warnings || []).length > 0;
  const items = usageRules.map(rule => {
    let state = 'unknown';
    let reason = '信息不足，补充规格后自动判断。';
    if (blocked) {
      reason = unconfirmedDevice ? '先确认这是外接线并加入清单，系统设备连接不自动当作实体线材。' : '检测信息存在警告，暂不自动推荐用途。';
    } else if (rule.id === 'data' || rule.id === 'peripheral-data') {
      if (c.kind === 'power-only') { state = 'limited'; reason = '记录为仅供电，不满足数据通信要求。'; }
      else if (c.kind === 'data') {
        state = rule.id === 'data' ? 'match' : 'conditional';
        reason = rule.id === 'data' ? (speed ? `声明 ${c.dataLabel}，可用于文件传输；实际速度依设备而定。` : '已确认可传数据；最高速度仍待确认。') : '线材具备数据能力；还需确认设备支持有线模式、接口匹配。';
      }
    } else if (rule.id === 'fast-data') {
      if (c.kind === 'power-only') { state = 'limited'; reason = '仅供电线不能传输文件。'; }
      else if (c.kind === 'data' && speed !== null) {
        state = speed >= 5000 ? 'match' : 'limited';
        reason = speed >= 5000 ? `声明 ${c.dataLabel}，适合高速传输用途；端口和硬盘也需匹配。` : `声明 ${c.dataLabel}，可留作普通文件传输，不优先用于大文件。`;
      }
    } else if (rule.id === 'peripheral-charge') {
      if (connectorKnown && c.ratingVoltageV >= 5 && c.ratingCurrentA >= 1) {
        state = 'conditional'; reason = '可作为 5V、1A 以内小设备的充电候选；核对接口与设备要求。';
      }
    } else {
      const threshold = rule.id === 'phone' ? 30 : 60;
      if (power !== null && power < threshold) { state = 'limited'; reason = `标称 ${power}W，低于本工具优先选用的 ${threshold}W 门槛；不表示完全不能充电。`; }
      else if (power !== null && cc) {
        const highPowerValid = power <= 100 || c.epr === true;
        if (!highPowerValid) reason = '超过 100W 的声明还缺少 EPR 依据，先补充核对。';
        else if (rule.id === 'travel' && (c.kind !== 'data' || speed === null)) reason = '充电信息已有，但高速数据能力尚未确认。';
        else if (rule.id === 'travel' && speed < 5000) { state = 'limited'; reason = '可优先用于充电，数据等级未达到出行多用途门槛。'; }
        else {
          state = 'conditional';
          reason = rule.id === 'phone' ? `标称 ${power}W，可作手机主力充电候选；具体机型、协议与充电器仍需匹配。` : rule.id === 'laptop' ? `标称 ${power}W，可用于功率需求不超过该档位的 USB PD 笔记本方案。` : `标称 ${power}W / ${c.dataLabel}，同时满足本工具的充电与数据整理门槛。`;
        }
      } else if (power !== null && connectorKnown && !cc) reason = '这条线需按对应接口与厂商方案确认，不能直接套用 USB-C 双头规则。';
    }
    return { ...rule, state, reason, source, label: state === 'match' ? '适合' : state === 'conditional' ? '可作候选' : state === 'limited' ? '不优先' : '待确认' };
  });
  const order = power >= 100 ? ['travel', 'laptop', 'fast-data', 'phone', 'data', 'peripheral-charge', 'peripheral-data'] : ['travel', 'fast-data', 'phone', 'peripheral-charge', 'data', 'peripheral-data', 'laptop'];
  const primary = order.map(id => items.find(r => r.id === id)).find(r => r.state === 'match' || r.state === 'conditional') || null;
  return { primary, items, source, version: usageRulesVersion };
}
