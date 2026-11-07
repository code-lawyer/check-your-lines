import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Bookmark, BookOpen, Cable as CableIcon, Check, ChevronRight, CircleHelp, Cpu, Info, Laptop, Link2, LoaderCircle, Pencil, Plus, Radio, Search, ShieldCheck, Smartphone, Trash2, Usb, X, Zap } from 'lucide-react'
import { brands, compatibility } from '../shared/brands.mjs'
import { demoCables } from './demo'
import type { Cable, Snapshot, CompatibilityCheck, CatalogRecoveryInfo, CatalogRecoveryRequest } from './types'
import { CatalogEditor } from './CatalogEditor'
import { RulesPage, UsageRecommendation } from './Usage'
import { loadCatalog, saveCatalog } from './catalog-store'
import { cableFacts, recommendUses } from '../shared/recommendations.mjs'
import { parseBackup, maxCatalogBytes } from '../shared/catalog.mjs'
import { buildExport } from '../shared/exports.mjs'
import { ScanDetails } from './ScanDetails'
import { CompatibilityDialog } from './CompatibilityDialog'
import { appVersion } from '../shared/version.mjs'

const colors = ['#4967e8', '#24947c', '#bb8a46', '#9866c7', '#cb6576']
type Page = 'live' | 'saved' | 'guide' | 'rules'
const blank: Snapshot = { platform: window.cablewise?.platform === 'darwin' ? 'macOS' : 'Windows', cables: [], scannedAt: '', capabilities: { singleEnded: 'unknown', emarker: 'unknown', message: '' } }
const dataText = (c: Cable) => c.kind === 'data' ? '可传数据' : c.kind === 'power-only' ? '仅供电' : '用途待确认'
const valueText = (v: number | null, unit: string) => v === null ? '待确认' : `${v} ${unit}`

function CableDrawing({ color, muted = false }: { color: string; muted?: boolean }) {
  return <svg className="cable-drawing" viewBox="0 0 260 104" fill="none" aria-hidden="true">
    <path d="M51 31H95C111 31 118 40 118 53V66C118 83 130 91 149 91H180C198 91 211 77 211 59V31" stroke="#15213b" strokeOpacity=".06" strokeWidth="12" transform="translate(0 3)"/>
    <path d="M51 31H95C111 31 118 40 118 53V66C118 83 130 91 149 91H180C198 91 211 77 211 59V31" stroke={color} strokeOpacity={muted ? '.45' : '1'} strokeWidth="8" strokeLinecap="round" strokeDasharray={muted ? '4 8' : undefined}/>
    <rect x="17" y="22" width="22" height="18" rx="5" fill="#dce2eb" stroke="#aeb9c9"/>
    <rect x="32" y="18" width="33" height="26" rx="9" fill={color}/><path d="M23 27v8M28 27v8" stroke="#8a97aa" strokeWidth="2"/>
    <rect x="203" y="4" width="16" height="22" rx="5" fill="#dce2eb" stroke="#aeb9c9"/>
    <rect x="198" y="20" width="26" height="29" rx="9" fill={color}/><path d="M207 10h8M207 14h8" stroke="#8a97aa" strokeWidth="1.5"/>
  </svg>
}

export default function App() {
  const [page, setPage] = useState<Page>('live')
  const [demo, setDemo] = useState(!window.cablewise)
  const [snapshot, setSnapshot] = useState<Snapshot>(blank)
  const [saved, setSaved] = useState<Cable[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [catalogRecovery, setCatalogRecovery] = useState<CatalogRecoveryInfo|null>(null)
  const [recovering, setRecovering] = useState(false)
  const recoveryLock = useRef(false)
  const recoveryInput = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const savingLock = useRef(false)
  const [editing, setEditing] = useState<Cable | null>(null)
  const [exportFormat, setExportFormat] = useState<'html' | 'csv' | 'json'>('html')
  const importInput = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const checkLock = useRef(false)
  const [checkOpen, setCheckOpen] = useState(false)
  const [checkResult, setCheckResult] = useState<CompatibilityCheck|null>(null)
  const [toast, setToast] = useState('')
  const [brandFilter, setBrandFilter] = useState('all')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const scanLock = useRef(false)
  const cards = useMemo(() => page === 'saved' ? saved : demo ? demoCables : snapshot.cables, [page, saved, demo, snapshot.cables])
  const visible = cards.filter(c => `${c.name} ${c.portLabel} ${c.deviceName || ''} ${c.storageLocation || ''} ${recommendUses(c).primary?.title || ''}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || filter === cableFacts(c).kind || filter === 'known' && ['emarker','controller'].includes(c.evidence)))
  const selected = cards.find(c => c.id === selectedId) || visible[0] || cards[0]
  const selectedFacts = cableFacts(selected || {}) as Cable
  const compared = cards.filter(c => compareIds.includes(c.id))
  const detected = snapshot.cables.filter(c => c.presence === 'cable').length
  const displayName = (c: Cable) => c.name
  const colorFor = (c: Cable) => c.color || colors[Math.max(0, cards.findIndex(x => x.id === c.id)) % colors.length]
  const notify = (text: string) => setToast(text)

  const scan = useCallback(async () => {
    if (!window.cablewise || scanLock.current || checkLock.current) return
    scanLock.current = true; setBusy(true); setError('')
    try { setSnapshot(await window.cablewise.scan()) } catch { setError('暂时无法读取电脑的 USB 信息。请稍后重新扫描。'); setSnapshot(s => ({ ...s, cables: [] })) }
    finally { scanLock.current = false; setBusy(false) }
  }, [])
  useEffect(() => { if (!demo) { void scan(); const id = setInterval(() => { if (!document.hidden) void scan() }, 12000); return () => clearInterval(id) } }, [demo, scan])
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 3500); return () => clearTimeout(id) } }, [toast])
  const readCatalog = useCallback(async () => {
    setCatalogError(''); setCatalogReady(false);setCatalogRecovery(null)
    try { setSaved(await loadCatalog()); setCatalogReady(true) }
    catch {
      setCatalogError(window.cablewise?'线材清单读取失败。请重试，或选择备份恢复。':'线材清单读取失败，请重试；原数据仍会保留。')
      if(window.cablewise) try {setCatalogRecovery(await window.cablewise.catalogRecoveryInfo())} catch {}
    }
  }, [])
  useEffect(() => { void readCatalog() }, [readCatalog])
  useEffect(() => { setCompareIds([]); setQuery(''); setFilter('all') }, [page, demo])
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setCompareOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [])

  async function persist(records: Cable[]) {
    if (!catalogReady) throw new Error('请先成功读取原有清单')
    if (savingLock.current) throw new Error('正在保存，请稍后重试')
    savingLock.current = true; setSaving(true)
    try { const clean = await saveCatalog(records); setSaved(clean) }
    finally { savingLock.current = false; setSaving(false) }
  }
  async function recoverCatalog(request:CatalogRecoveryRequest) {
    if(!window.cablewise || recoveryLock.current) return
    recoveryLock.current=true;setRecovering(true)
    try {
      const {records,originalPreserved}=await window.cablewise.recoverCatalog(request)
      setSaved(records);setCatalogReady(true);setCatalogError('');setCatalogRecovery(null);setPage('saved')
      notify(`已恢复 ${records.length} 条记录${originalPreserved?'；原文件已保留':''}`)
    } catch(error) {setCatalogError(error instanceof Error?error.message:'恢复失败，原文件仍保留。')}
    finally {recoveryLock.current=false;setRecovering(false)}
  }
  function save(c: Cable) {
    setEditing({ ...c, id: crypto.randomUUID(), originId: c.id, inventoryId: undefined, name: displayName(c), color: colorFor(c), savedAt: undefined, demo: Boolean(c.demo || demo && page !== 'saved') })
  }
  function addCable() {
    setEditing({ id: crypto.randomUUID(), name: '', portLabel: '手动登记', connector: '接口类型待确认', evidence: 'manual', presence: 'manual', sourceLabel: '用户登记', kind: 'unknown', ratingCurrentA: null, ratingVoltageV: null, operationalVoltageV: null, maxPowerW: null, dataLabel: null, currentSpeedLabel: null, warnings: [], note: '线材规格可由用户补充；未填写的信息保持待确认。' })
  }
  async function exportReport() {
    try {
      const report = buildExport(cards.map(c => ({ ...c, name: displayName(c), demo: Boolean(c.demo || demo && page !== 'saved') })), exportFormat, page === 'saved' ? 'catalog' : demo ? 'demo' : 'live')
      if (window.cablewise) { if (await window.cablewise.exportReport(report, exportFormat)) notify('清单已导出') }
      else { const url = URL.createObjectURL(new Blob([report], { type: { html: 'text/html', csv: 'text/csv', json: 'application/json' }[exportFormat] })); const a = document.createElement('a'); a.href = url; a.download = `Cablewise-catalog.${exportFormat}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('清单已导出') }
    } catch (err) { notify(err instanceof Error ? err.message : '导出未成功，请重新选择保存位置') }
  }
  function openSource(url: string) { if (window.cablewise) void window.cablewise.openSource(url); else window.open(url, '_blank', 'noopener,noreferrer') }
  async function checkComputer(restore:boolean) {
    if(!window.cablewise||checkLock.current) return
    checkLock.current=true;setChecking(true);setCheckResult(null)
    try {setCheckResult(await (restore?window.cablewise.restoreComputer():window.cablewise.checkComputer()))}
    catch {setCheckResult({restored:false,error:'未收到完整诊断结果，请先恢复设置。'})}
    finally {checkLock.current=false;setChecking(false);void scan()}
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><CableIcon size={25}/></span><div><strong>线知</strong><span>CABLEWISE</span></div></div>
      <div className="nav-label">你的线材工作台</div>
      <nav aria-label="主导航">
        <button className={page === 'live' ? 'nav active' : 'nav'} onClick={() => setPage('live')}><Usb size={19}/>当前连接<span className="nav-count">{demo ? demoCables.length : snapshot.cables.length}</span></button>
        <button className={page === 'saved' ? 'nav active' : 'nav'} onClick={() => setPage('saved')}><Bookmark size={19}/>我的线材{saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>
        <button className={page === 'rules' ? 'nav active' : 'nav'} onClick={() => setPage('rules')}><BookOpen size={19}/>用途标准</button>
        <button className={page === 'guide' ? 'nav active' : 'nav'} onClick={() => setPage('guide')}><BookOpen size={19}/>使用指南</button>
      </nav>
      <div className="sidebar-note"><span className="small-orbit"><Link2 size={20}/></span><strong>每根线，都有合适的用途。</strong><p>把充电、传输和适配信息<br/>放在一起看清楚。</p></div>
      <div className="sidebar-bottom"><span className="version-dot"/>{appVersion}<span>本地运行</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="crumb">工作台<ChevronRight size={13}/><span>{page === 'live' ? '当前连接' : page === 'saved' ? '我的线材' : page === 'rules' ? '用途标准' : '使用指南'}</span></div><div className="top-actions"><span className="platform"><Laptop size={15}/>{window.cablewise ? snapshot.platform : '浏览器预览'}</span><button className="text-button" onClick={() => { setDemo(!demo); setPage('live') }}>{demo ? <Radio size={15}/> : <CircleHelp size={15}/>} {demo ? '返回真实检测' : '查看演示'}</button></div></header>
      {catalogError && <div className="catalog-error" role="alert"><div><strong>{catalogError}</strong>{window.cablewise&&<p>恢复会使用所选备份的记录。损坏原件会另存保留，已有备份也会保留。</p>}{catalogRecovery?.available&&<p>上一版备份：{catalogRecovery.records} 条 · {new Date(catalogRecovery.savedAt!).toLocaleString('zh-CN')}</p>}</div><div className="catalog-recovery-actions"><button disabled={recovering} onClick={() => void readCatalog()}>重试读取</button>{catalogRecovery?.available&&<button disabled={recovering} onClick={()=>void recoverCatalog({source:'backup'})}>恢复上一版备份</button>}{window.cablewise&&<button disabled={recovering} onClick={()=>recoveryInput.current?.click()}>选择 JSON 备份恢复</button>}</div>{recovering&&<p role="status">正在恢复记录…</p>}<input ref={recoveryInput} type="file" accept="application/json,.json" aria-label="选择恢复用的 JSON 备份" hidden onChange={async e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file||recoveryLock.current) return
        try {if(file.size>maxCatalogBytes) throw new Error('备份文件请小于 100 MB');await recoverCatalog({source:'import',records:parseBackup(await file.text()) as Cable[]})}
        catch(error){setCatalogError(error instanceof Error?error.message:'备份读取失败，原文件仍保留。')}
      }}/></div>}
      {demo && page === 'live' && <div className="demo-banner"><Info size={15}/><span><b>演示模式</b> · 以下是示例线材，不是这台电脑的检测结果。</span>{!window.cablewise && <span className="browser-note">真实检测需要桌面应用</span>}</div>}

      {page === 'rules' ? <RulesPage onSource={openSource}/> : page === 'guide' ? <main className="guide-page"><span className="eyebrow">一点点了解，就很好用</span><h1>认识手边的每一根线。</h1><p className="lead">先插入电脑，让线知看看系统能告诉我们什么。</p><div className="guide-grid">
        {[
          ['01', '把线插上，支持同时查看', '可以同时插入多个 USB 端口。能读到芯片时，会分别显示每根线的声明信息；端口编号不一定对应电脑外壳的位置。', <Usb/>],
          ['02', '没有出现，不代表是坏线', 'Windows 及部分 Mac 无法发现另一端悬空的线。可以先登记，也可以将另一端连接手机、硬盘等设备，再重新扫描。', <CircleHelp/>],
          ['03', '充电能力和传文件要分开看', '240W 的线也可能只有 USB 2.0 数据速度。没有读到数据能力时，我们显示待确认，不会直接把它归为仅供电线。', <Zap/>],
          ['04', '品牌快充，还需要搭配', '线材、充电器和手机型号共同决定快充。每个品牌的详情里都有要求及官方来源。线材条件符合，并不等于已经实测快充。', <Smartphone/>],
          ['05', '名字和照片，帮你找回实物', '在「我的线材」添加线材，填写名称、照片和存放位置；也可以从当前连接加入。照片仅用于辨认，不会自动推测规格。', <Bookmark/>],
          ['06', '自动整理，也能带走', '清单自动汇总档案与用途建议。HTML 是含照片的图文清单，可打印；CSV 便于表格整理；JSON 包含照片，可在另一台电脑导入。', <ArrowDownToLine/>]
        ].map(([number, title, body, icon]) => <article className="guide-card" key={String(number)}><div className="guide-icon">{icon}<span>{number}</span></div><h2>{title}</h2><p>{body}</p></article>)}
      </div><div className="guide-foot"><ShieldCheck/><div><strong>只说明有依据的结果</strong><p>芯片声明、当前连接、手动记录分别标注。此版本不测线阻、内部断线或高速信号质量，也不给线材编造健康分。</p></div></div></main> : <main className="main-content">
        <section className="page-heading"><div><span className="eyebrow">{page === 'saved' ? '认得出来，也用得合适' : '充电 · 传输 · 品牌适配'}</span><h1>{page === 'saved' ? '我的线材清单' : '看看这些线，能做什么。'}</h1><p>{page === 'saved' ? '名称、照片和用途自动汇成清单，拔掉线后仍会保留。' : '分别查看每条连接的信息，为每一根线找到用途。'}</p></div><div className="heading-actions"><select className="export-select" aria-label="导出格式" value={exportFormat} onChange={e=>setExportFormat(e.target.value as typeof exportFormat)}><option value="html">图文清单 · 含照片</option><option value="csv">CSV 表格 · 不含照片</option><option value="json">完整 JSON 备份</option></select><button className="button secondary" onClick={exportReport} disabled={!cards.length || saving}><ArrowDownToLine size={16}/>导出</button>{page === 'saved' ? <button className="button primary" disabled={!catalogReady || saving} onClick={addCable}><Plus size={16}/>添加线材</button> : <button className="button primary" onClick={() => demo ? notify('演示模式使用固定示例，可返回真实检测扫描电脑') : window.cablewise ? void scan() : notify('请打开桌面应用进行真实检测')} disabled={busy}><Radio size={16} className={busy ? 'spin' : ''}/>{busy ? '正在读取' : '重新扫描'}</button>}</div></section>
        {page === 'saved' && <div className="catalog-summary"><span><b>{saved.length}</b> 根已登记</span><span><b>{saved.filter(c=>c.photoDataUrl).length}</b> 根有照片</span><span><b>{saved.filter(c=>recommendUses(c).primary).length}</b> 根有用途建议</span><button className="text-button" disabled={!catalogReady || saving} onClick={()=>importInput.current?.click()}>导入 JSON 备份</button><input ref={importInput} type="file" accept="application/json,.json" aria-label="导入线材备份" hidden onChange={async e=>{
          const file=e.target.files?.[0]; e.target.value=''; if(!file) return
          try { if(file.size>maxCatalogBytes) throw new Error('备份文件请小于 100 MB'); const records=parseBackup(await file.text()) as Cable[]; const ids=new Set(saved.map(c=>c.id)); const added=records.filter(c=>!ids.has(c.id)); await persist([...saved,...added]); notify(`已导入 ${added.length} 条，跳过 ${records.length-added.length} 条重复记录`) } catch(err) { notify(err instanceof Error ? err.message : '导入失败') }
        }}/></div>}

        {!demo && page === 'live' && <><div className="detection-note"><Info size={19}/><div><strong>{error || (detected ? `已读取 ${detected} 根线材的芯片信息` : snapshot.cables.length ? `已识别 ${snapshot.cables.length} 个外接连接` : busy ? '正在读取连接' : '暂未发现外接连接')}</strong><p>{error ? '本次列表已清空，避免把旧结果显示为当前检测。' : snapshot.capabilities.message || '正在读取电脑开放的 USB 信息。'}</p></div><button onClick={() => setPage('guide')}>如何识别<ArrowUpRight size={14}/></button></div>{!error && <ScanDetails snapshot={snapshot}/>}</>}
        {!demo && page==='live' && window.cablewise?.platform==='win32' && <div className="compatibility-action"><button className="text-button" disabled={checking||busy} onClick={()=>{setCheckResult(null);setCheckOpen(true)}}><ShieldCheck size={15}/>{snapshot.diagnostics?.needsRestore?'恢复上次诊断设置':'检查电脑兼容性'}</button><span>{snapshot.diagnostics?.needsRestore?'上一次诊断的设置恢复尚未确认。':'查看这台电脑能否读取线材额定规格'}</span>{checkResult?.profile&&<button className="text-button" onClick={()=>setCheckOpen(true)}>上次检查结果</button>}</div>}

        <div className="content-grid"><section className="cables-pane">
          <div className="list-top"><div className="section-title"><h2>{page === 'saved' ? '线材档案' : '外接连接'}</h2><span>{cards.length}</span></div><span className="quiet-status"><i className={busy || saving ? 'busy' : ''}/>{page === 'saved' ? saving ? '正在保存' : catalogReady ? '保存在本机' : '读取清单中' : demo ? '示例数据' : busy ? '读取中' : '自动刷新'}</span></div>
          <label className="search-box"><Search size={17}/><input placeholder="搜索名称或连接设备" value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索线材"/>{query && <button aria-label="清空搜索" onClick={() => setQuery('')}><X size={14}/></button>}</label>
          <div className="filter-row">{[['all', '全部'], ['known', '已读规格'], ['data', '可传数据'], ['unknown', '待确认']].map(([id, name]) => <button key={id} className={filter === id ? 'filter selected' : 'filter'} onClick={() => setFilter(id)}>{name}</button>)}</div>
          <div className="cable-grid">{visible.map(record => { const c = cableFacts(record) as Cable; const usage = recommendUses(record); return <article key={c.id} className={`cable-card ${selected?.id === c.id ? 'is-selected' : ''}`} style={{ '--cable-color': colorFor(c) } as React.CSSProperties}>
            <div className="card-top"><span className="port-name"><span className="port-dot"/>{c.portLabel}</span><label className="compare-check" title="加入对比"><input type="checkbox" aria-label={`对比${displayName(c)}`} checked={compareIds.includes(c.id)} onChange={e => setCompareIds(ids => e.target.checked ? ids.length >= 4 ? (notify('一次最多对比 4 条记录'), ids) : [...ids, c.id] : ids.filter(id => id !== c.id))}/></label></div>
            <button className="card-select" onClick={() => setSelectedId(c.id)} aria-label={`查看${displayName(c)}`} aria-pressed={selected?.id === c.id}>
              {c.photoDataUrl ? <img className="cable-photo" src={c.photoDataUrl} alt={`${displayName(c)}的照片`}/> : c.presence === 'device' && !c.inventoryId ? <div className="device-illustration"><span style={{ color: colorFor(c) }}><Usb size={37} strokeWidth={1.3}/></span><div><b>{c.connectionScope === 'external' ? '已识别外接连接' : '系统设备连接'}</b><small>{c.connectionScope === 'external' ? '已确认可进行 USB 数据通信' : '尚未确认对应线材'}</small></div></div> : <CableDrawing color={colorFor(c)} muted={c.evidence === 'manual'}/>}
              <h3>{displayName(c)}</h3><p className="connector">{c.connector}</p>
              <div className="card-metrics"><div><Zap size={14}/><span>{c.maxPowerW === null ? c.specReadState === 'host-unsupported' ? '电脑未提供功率' : '功率未读取' : <><b>{c.maxPowerW}</b> W</>}</span></div><div><ArrowLeftRight size={14}/><span>{c.dataLabel || (c.currentSpeedLabel ? '连接 '+c.currentSpeedLabel : '速度未读取')}</span></div></div>
              {(page === 'saved' || usage.primary) && <div className="card-usage"><span>{usage.primary?.title || '用途待确认'}</span><small>{page === 'saved' ? c.storageLocation || '未填写存放位置' : '依据当前已知信息推荐'}</small></div>}
              <div className="card-footer"><span className={`status-badge ${c.kind === 'data' ? 'green' : 'amber'}`}>{c.kind === 'data' ? <Check size={12}/> : <CircleHelp size={12}/>} {dataText(c)}</span><span className="evidence-short">{c.demo && page === 'saved' ? '演示记录' : c.recordedSpecs && Object.keys(c.recordedSpecs).some(k=>k!=='sourceNote') ? '用户补充' : c.evidence === 'emarker' ? '芯片声明' : c.evidence === 'controller' ? '系统上报规格' : c.evidence === 'connection' ? '设备连接' : '手动记录'}</span></div>
            </button>
          </article>})}</div>
          {!visible.length && <div className="empty-state"><CableIcon size={40}/><h3>{cards.length ? '没有符合条件的记录' : page === 'saved' ? '把线材信息留在这里' : busy ? '正在读取连接信息' : '电脑暂未上报线材信息'}</h3><p>{cards.length ? '试试其他关键词或查看全部。' : page === 'saved' ? '点击添加线材，填写名字和照片；也可以从当前连接加入。' : '可以先登记这根线，或将另一端接入设备后重新扫描。'}</p>{cards.length > 0 && <button className="button secondary" onClick={() => { setQuery(''); setFilter('all') }}>查看全部</button>}</div>}
          {page === 'live' && <button className="add-cable" disabled={!catalogReady || saving} onClick={addCable}><Plus size={18}/><span>插了线却没出现？<b>手动登记</b></span><ChevronRight size={16}/></button>}
          <div className="subtle-help"><ShieldCheck size={15}/>{page === 'saved' ? '记录只保存在这台电脑，不会上传。' : '规格来源会单独标注；当前连接速度不等于线材最高速度。'}</div>
        </section>

        {selected ? <aside className="detail-pane"><div className="detail-heading"><span className="eyebrow">{page === 'saved' ? '我的线材档案' : '这条记录的详情'}</span><div><h2>{displayName(selected)}</h2><button className="icon-button" aria-label={page === 'saved' ? '编辑线材档案' : '命名并保存线材'} disabled={saving || !catalogReady} onClick={() => { if (page === 'saved') setEditing(selected); else save(selected) }}><Pencil size={16}/></button></div><span className="source-pill"><Cpu size={12}/>{selected.sourceLabel}</span></div>
          {page === 'saved' && <div className="inventory-meta"><span>{selected.inventoryId || '旧版记录'}</span><span>{selected.storageLocation || '存放位置未填写'}</span>{selected.userNote && <p>{selected.userNote}</p>}{selected.recordedSpecs?.sourceNote && <p>补充规格依据：{selected.recordedSpecs.sourceNote}</p>}</div>}
          <UsageRecommendation cable={selected} onRules={() => setPage('rules')}/>
          <div className="detail-section"><h3><Zap size={17}/>充电能力</h3><div className="power-hero"><strong>{selectedFacts.maxPowerW ?? '—'}</strong><span>{selectedFacts.maxPowerW === null ? selected.specReadState === 'host-unsupported' ? '此电脑无法读取额定功率' : '额定功率未读取' : selected.recordedSpecs?.maxPowerW ? 'W · 用户补充标称' : 'W · 芯片声明上限'}</span></div><div className="rating-grid"><div><span>额定电流</span><b>{selectedFacts.ratingCurrentA === null ? '未读取' : valueText(selectedFacts.ratingCurrentA, 'A')}{selected.recordedSpecs?.ratingCurrentA && <small>用户补充</small>}</b></div><div><span>额定电压</span><b>{selectedFacts.ratingVoltageV === null ? '未读取' : valueText(selectedFacts.ratingVoltageV, 'V')}{selected.recordedSpecs?.ratingVoltageV && <small>用户补充</small>}</b></div></div><p className="field-note">{selectedFacts.ratingVoltageV === 50 ? '50V 是线材额定电压；USB PD 实际最高输出为 48V，不是正在充电的电压。' : selectedFacts.ratingCurrentA ? '这是线材的声明限值，不是当前充电的电流或电压。' : selected.powerEvidence || '系统没有提供线材限值，暂不能确认充电能力。'}</p></div>
          <div className="detail-section data-section"><h3><ArrowLeftRight size={17}/>数据传输</h3><div className="data-result"><span>{dataText(selectedFacts)}</span><b>{selectedFacts.dataLabel || '声明速度待确认'}</b></div><p className="field-note">{selected.recordedSpecs?.dataLabel ? '用户补充的标称速度，尚未进行实际传输测试。' : selectedFacts.dataLabel ? selectedFacts.speedNote || '芯片声明的速度，尚未进行实际传输测试。' : '未读到声明速度，不能据此判断是仅供电线。'}</p>{selectedFacts.currentSpeedLabel && <p className="field-note">{page === 'saved' ? '保存时' : '当前'}连接：{selectedFacts.currentSpeedLabel}，不代表线材最高速度。</p>}</div>
          <div className="detail-section compatibility-section"><div className="compatibility-heading"><h3><Smartphone size={17}/>适合哪些品牌</h3><select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} aria-label="选择品牌"><option value="all">全部品牌</option>{brands.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></div><p className="field-note">以下检查线材条件，实际快充还要匹配机型和充电器。</p><div className="brand-list">{brands.filter(b => brandFilter === 'all' || b.id === brandFilter).map(b => { const result = compatibility(selected, b); return <details className="brand-row" key={b.id}><summary><span className="brand-monogram" style={{ color: b.color }}>{b.mark}</span><span className="brand-info"><b>{b.name}</b><small>{b.protocol}</small></span><span className={`compatibility-status ${result.state}`}>{result.label}</span><ChevronRight size={13}/></summary><div className="brand-explanation"><strong>{b.scope}</strong><p>{result.detail}</p><button onClick={() => openSource(b.source)}>查看官方依据<ArrowUpRight size={13}/></button></div></details> })}</div></div>
          <div className="detail-note"><Info size={15}/><p>{selected.note}</p></div>
          {selected.warnings.length > 0 && <div className="warning-list">{selected.warnings.map(w => <p key={w}>{w}</p>)}</div>}
          <details className="raw-details"><summary>信息来源与详细字段</summary><p>{selected.savedAt ? `保存于 ${new Date(selected.savedAt).toLocaleString('zh-CN')}` : `读取于 ${snapshot.scannedAt ? new Date(snapshot.scannedAt).toLocaleTimeString('zh-CN') : '演示快照'}`}</p><p>来源：{selected.sourceLabel}</p>{selected.location && <p>连接位置：{selected.location}</p>}{selected.rawVdos && <p>芯片原始字段：{selected.rawVdos.join(' · ')}</p>}<p>质量与品牌私有协议：未实测。</p></details>
          <div className="detail-actions">{page === 'saved' ? <button className="button secondary full" disabled={saving || !catalogReady} onClick={async () => { try { await persist(saved.filter(c=>c.id!==selected.id)); notify('记录已移除') } catch(err) { notify(err instanceof Error ? err.message : '移除失败') } }}><Trash2 size={15}/>移除此记录</button> : <button className="button secondary full" disabled={saving || !catalogReady} onClick={() => save(selected)}><Bookmark size={16}/>加入我的线材</button>}</div>
        </aside> : <aside className="detail-pane empty-detail"><span className="detail-empty-icon"><CableIcon size={34}/></span><h3>每根线，单独看清。</h3><p>选中一条记录，即可查看充电能力、数据用途和品牌适配要求。</p><div className="empty-detail-chips"><span><Zap size={14}/>充电</span><span><ArrowLeftRight size={14}/>数据</span><span><Smartphone size={14}/>品牌</span></div></aside>}
        </div>
      </main>}
      <footer className="workspace-footer"><span><ShieldCheck size={13}/>所有检测在本机完成</span><span>Cablewise {appVersion}</span></footer>
    </div>
    {compared.length >= 2 && (page === 'live' || page === 'saved') && <div className="compare-bar"><span>已选 {compared.length} 条记录</span><button onClick={() => setCompareIds([])}>清空</button><button className="button primary" onClick={() => setCompareOpen(true)}><ArrowLeftRight size={16}/>并排对比</button></div>}
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {checkOpen && <CompatibilityDialog busy={checking} result={checkResult} needsRestore={Boolean(snapshot.diagnostics?.needsRestore)} onRun={checkComputer} onSave={c=>{setCheckOpen(false);save(c)}} onClose={()=>{if(!checking)setCheckOpen(false)}}/>}
    {editing && <CatalogEditor cable={editing} saving={saving} onClose={() => { if(!saving) setEditing(null) }} onSave={async record => {
      await persist(saved.some(c=>c.id===record.id) ? saved.map(c=>c.id===record.id ? record : c) : [...saved,record])
      setEditing(null); setPage('saved'); setSelectedId(record.id); notify(record.demo ? '演示线材已保存，仍保留示例标记' : '线材已保存，清单与用途建议已更新')
    }}/>}
    {compareOpen && <div className="modal-backdrop"><div className="comparison-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title"><button className="modal-close icon-button" aria-label="关闭对比" onClick={() => setCompareOpen(false)}><X size={21}/></button><span className="eyebrow">把区别放在一起</span><h2 id="compare-title">线材与连接对比</h2><p>芯片声明、连接速度和未知信息分别呈现。</p><div className="table-scroll"><table><thead><tr><th>查看项目</th>{compared.map(c => <th key={c.id}><span className="comparison-dot" style={{ background: colorFor(c) }}/>{displayName(c)}</th>)}</tr></thead><tbody>{[
      ['推荐用途', (c: Cable) => recommendUses(c).primary?.title || '待确认'], ['数据能力', (c: Cable) => dataText(c)], ['额定功率', (c: Cable) => valueText(c.maxPowerW, 'W')], ['额定电流', (c: Cable) => valueText(c.ratingCurrentA, 'A')], ['额定电压', (c: Cable) => valueText(c.ratingVoltageV, 'V')], ['声明数据速度', (c: Cable) => c.dataLabel || '待确认'], ['当前连接速度', (c: Cable) => c.currentSpeedLabel || '未提供'], ['信息来源', (c: Cable) => c.sourceLabel]
    ].map(([title, value]) => <tr key={String(title)}><td>{String(title)}</td>{compared.map(c => <td key={c.id}>{(value as (c: Cable) => string)(cableFacts(c) as Cable)}</td>)}</tr>)}</tbody></table></div><div className="comparison-foot"><Info size={15}/>没有进行电气质量测试，不能据此给线材排质量名次。</div></div></div>}
  </div>
}
