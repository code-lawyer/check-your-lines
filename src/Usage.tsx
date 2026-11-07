import { ArrowUpRight, BookOpen, CircleHelp, Sparkles } from 'lucide-react'
import { recommendUses, usageRules, usageRulesVersion, usageSources } from '../shared/recommendations.mjs'
import type { Cable } from './types'

export function UsageRecommendation({ cable, onRules }: { cable: Cable; onRules: () => void }) {
  const result = recommendUses(cable)
  return <section className="usage-panel"><div className="usage-heading"><h3><Sparkles size={16}/>用途建议</h3><button onClick={onRules}>区分标准<ArrowUpRight size={13}/></button></div>
    <strong className="primary-use">{result.primary?.title || '补充规格，再帮你安排用途'}</strong>
    <p>{result.primary?.reason || '没有读到信息时，也不会默认把它推荐给鼠标、键盘充电。可在档案里补充已知规格。'}</p>
    <details><summary>查看其他用途与判断依据</summary>{result.items.map(r=><div className="usage-result" key={r.id}><div><b>{r.title}</b><span className={`usage-state ${r.state}`}>{r.label}</span></div><p>{r.reason}</p></div>)}<small>{result.source}</small></details>
  </section>
}
export function RulesPage({ onSource }: { onSource: (url: string) => void }) {
  return <main className="rules-page"><span className="eyebrow">把每根线放在合适的位置</span><h1>内置用途区分表</h1><p className="lead">同一根线可以有多个用途。根据已知规格生成推荐，信息变化后重新判断。</p><div className="rules-note"><CircleHelp size={20}/><p>下面的门槛是线知的整理规则，不是行业认证标准，也不是所有设备的最低要求。每条建议仍需核对接口、设备和充电器。</p></div>
    <div className="rules-table-wrap"><table className="rules-table"><thead><tr><th>用途</th><th>优先选择条件</th><th>使用前需要知道</th></tr></thead><tbody>{usageRules.map(r=><tr key={r.id}><th>{r.title}</th><td>{r.criteria}</td><td>{r.explanation}</td></tr>)}</tbody></table></div>
    <div className="rules-foot"><BookOpen size={18}/><div><p>功率与数据速度分别判断；当前连接速度不当作线材上限。无证据时标记待确认；检测有警告时暂停推荐。规则版本：{usageRulesVersion}。</p><div className="rule-sources">{usageSources.map(s=><button key={s.url} onClick={()=>onSource(s.url)}>{s.title}<ArrowUpRight size={13}/></button>)}</div></div></div>
  </main>
}
