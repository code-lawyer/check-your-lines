import type { Snapshot } from './types'

export function ScanDetails({ snapshot }: { snapshot: Snapshot }) {
  const d = snapshot.diagnostics
  if (!d) return null
  return <details className="scan-details"><summary>查看扫描范围与识别说明</summary>
    <p>主列表只显示有依据的外接连接。内置蓝牙、摄像头等不计入；连接数量也不代表能识别每一根实体线。</p>
    <div className="scan-capabilities"><div><b>已获取</b><span>外接端口、设备名称、当前 USB 数据连接；USB-C 端口外形由系统提供。</span></div><div><b>尚未获取</b><span>{snapshot.capabilities.emarker === 'unavailable' ? '线材芯片声明的额定功率、电压、电流和最高数据等级。' : '没有芯片或电脑未开放的线材信息。'}</span></div></div>
    {d.internalDevices.length > 0 && <p>已排除 {d.internalDevices.length} 个内置设备：{d.internalDevices.map(x => x.name).join('、')}。</p>}
    {d.unclassifiedDevices.length > 0 && <div className="unclassified-devices"><b>另有 {d.unclassifiedDevices.length} 个设备归属未确认</b><p>没有足够的端口属性，暂不计入外接数量。可通过拔插确认是否与手里的线有关。</p>{d.unclassifiedDevices.map((x, i) => <p key={i}>{x.name}{x.location ? ` · ${x.location}` : ''}</p>)}</div>}
    {d.ucsi?.compatibility ? <p className="compatibility-finding">兼容性检查（{new Date(d.ucsi.compatibility.checkedAt).toLocaleDateString('zh-CN')}）：{d.ucsi.compatibility.reason} 这个结论针对电脑的读取能力，不是对线材好坏的判断。</p> : d.ucsi?.state === 'disabled' && <p>这台电脑的额外 USB-C 规格读取通道尚未开启；普通 USB 扫描不能读取线材额定功率。这不表示线材损坏或没有芯片。</p>}
    {snapshot.capabilities.warnings?.map((warning, i) => <p key={i}>{warning}</p>)}
  </details>
}
