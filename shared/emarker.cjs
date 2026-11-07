// Field locations and Apple IORegistry data handling informed by the
// MIT-licensed WhatCable project. See THIRD_PARTY_NOTICES.md.
// Keep unknown/reserved values unknown; do not apply a VPD layout to a cable.
function decodeIdentity(words, revision = 3) {
  if (!Array.isArray(words) || words.length < 4 || words.some(v => !Number.isInteger(v) || v < 0 || v > 0xffffffff)) return null;
  const type = (words[0] >>> 27) & 7;
  if (type !== 3 && type !== 4) return null;
  const vdo = words[3] >>> 0;
  const active = type === 4;
  const currentBits = (vdo >>> 5) & 3;
  const ratingCurrentA = ({ 1: 3, 2: 5 })[currentBits] ?? null;
  const speedBits = vdo & 7;
  const voltageBits = (vdo >>> 9) & 3;
  const versionBits = (vdo >>> 21) & 7;
  const plugBits = (vdo >>> 18) & 3;
  const warnings = [];
  if (!ratingCurrentA) warnings.push('芯片未提供可确认的额定电流');
  if (speedBits > 4) warnings.push('速度字段暂不支持解析');
  if (revision >= 3 && ((!active && versionBits !== 0) || (active && ![0, 2, 3].includes(versionBits)))) warnings.push('线材声明版本暂不支持解析');
  const epr = !active && revision >= 3 && Boolean(vdo & (1 << 17));
  if (epr && (voltageBits !== 3 || ratingCurrentA !== 5)) warnings.push('高功率声明与电压或电流字段不一致');
  // Unknown versions must never become a claimed current/voltage limit.
  if (![2, 3].includes(revision)) warnings.push('无法确认芯片协议版本');
  const validVersion = [2, 3].includes(revision) && !warnings.includes('线材声明版本暂不支持解析');
  const ratingVoltageV = validVersion ? (revision >= 3 ? [20,30,40,50][voltageBits] : 20) : null;
  const eprConfirmed = validVersion && epr && voltageBits === 3 && ratingCurrentA === 5;
  const canCarryPower = !active || Boolean(vdo & (1 << 4));
  const operationalVoltageV = validVersion && canCarryPower ? (eprConfirmed ? 48 : ratingVoltageV === 20 ? 20 : null) : null;
  const maxPowerW = operationalVoltageV && ratingCurrentA ? operationalVoltageV * ratingCurrentA : null;
  const speedLabels = ['480 Mbps', '5 Gbps', '10 Gbps', 'USB4 · 20/40 Gbps 等级', 'USB4 · 80 Gbps 等级'];
  return {
    evidence: 'emarker', kind: !active && speedBits <= 4 && validVersion ? 'data' : 'unknown',
    connector: plugBits === 2 ? 'USB-C ↔ USB-C' : 'USB-C · 另一端类型待确认',
    ratingCurrentA: validVersion ? ratingCurrentA : null, ratingVoltageV, operationalVoltageV, maxPowerW,
    dataLabel: validVersion ? speedLabels[speedBits] ?? null : null,
    currentSpeedLabel: null, activeCable: active, epr: eprConfirmed,
    // Speed 3 has an older PD 3.0 meaning; preserve the ambiguity.
    speedNote: speedBits === 3 ? '芯片速度编码在协议版本间存在差异，需连接设备确认具体档位。' : '芯片声明的信号等级，未进行传输测试。',
    vendorId: words[0] & 0xffff, warnings, rawVdos: words.map(v => '0x' + (v >>> 0).toString(16).padStart(8, '0'))
  };
}
module.exports = { decodeIdentity };
