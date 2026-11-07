import type { Cable } from './types'
const base = { evidence: 'emarker' as const, presence: 'cable' as const, connector: 'USB-C ↔ USB-C', sourceLabel: '线材芯片声明', currentSpeedLabel: null, warnings: [], demo: true, kind: 'data' as const }
export const demoCables: Cable[] = [
  { ...base, id: 'demo-1', name: '桌面主力线', portLabel: '示例端口 1', ratingCurrentA: 5, ratingVoltageV: 50, operationalVoltageV: 48, maxPowerW: 240, dataLabel: '10 Gbps', epr: true, color: '#4967e8', note: '示例：芯片声明支持高功率充电和高速传输。尚未测试真实线材质量。' },
  { ...base, id: 'demo-2', name: '随身充电线', portLabel: '示例端口 2', ratingCurrentA: 3, ratingVoltageV: 20, operationalVoltageV: 20, maxPowerW: 60, dataLabel: '480 Mbps', color: '#24947c', note: '示例：可以充电和传文件；数据速度属于 USB 2.0 档位。' },
  { ...base, id: 'demo-3', name: '抽屉里的白线', portLabel: '示例端口 3', evidence: 'manual', presence: 'manual', sourceLabel: '手动登记 · 未检测到', kind: 'unknown', ratingCurrentA: null, ratingVoltageV: null, operationalVoltageV: null, maxPowerW: null, dataLabel: null, color: '#bb8a46', note: '示例：电脑没有上报这根线的信息。仅凭未识别，无法判断它是否只能充电。' }
]
