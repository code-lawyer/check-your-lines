import { useEffect, useRef, useState } from 'react'
import { Camera, X, Trash2 } from 'lucide-react'
import type { Cable } from './types'
import { preparePhoto } from './photo'

export function CatalogEditor({ cable, saving, onSave, onClose }: { cable: Cable; saving: boolean; onSave: (c: Cable) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(cable.name)
  const [photo, setPhoto] = useState(cable.photoDataUrl || '')
  const [location, setLocation] = useState(cable.storageLocation || '')
  const [note, setNote] = useState(cable.userNote || '')
  const [specs, setSpecs] = useState<NonNullable<Cable['recordedSpecs']>>(cable.recordedSpecs || {})
  const [confirmed, setConfirmed] = useState(cable.presence !== 'device' || cable.connectionScope === 'external' || Boolean(cable.inventoryId))
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const disabled = saving || processing
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    form.current?.querySelector<HTMLInputElement>('input:not([type=file])')?.focus()
    return () => before?.focus()
  }, [])
  function update(key: keyof NonNullable<Cable['recordedSpecs']>, value: unknown) {
    setSpecs(old => { const next = { ...old }; if (value === '' || value === undefined) delete next[key]; else Object.assign(next, { [key]: value }); return next })
  }
  return <div className="modal-backdrop"><form ref={form} className="catalog-editor" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title" onKeyDown={e => {
    if (e.key === 'Escape' && !disabled) { e.stopPropagation(); onClose() }
    if (e.key === 'Tab') {
      const elements = Array.from(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []).filter(el => el.getClientRects().length)
      const first = elements[0], last = elements[elements.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }} onSubmit={async e => {
    e.preventDefault(); if (disabled || !confirmed || !name.trim()) return
    setError('')
    try {
      await onSave({ ...cable, name: name.trim(), photoDataUrl: photo || undefined, storageLocation: location.trim(), userNote: note.trim(), recordedSpecs: specs, inventoryId: cable.inventoryId || `CW-${crypto.randomUUID().slice(0,8).toUpperCase()}`, savedAt: cable.savedAt || new Date().toISOString(), updatedAt: new Date().toISOString() })
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试') }
  }}>
    <button type="button" className="modal-close icon-button" aria-label="关闭线材编辑" disabled={disabled} onClick={onClose}><X size={20}/></button>
    <span className="eyebrow">给你的线材建一张档案</span><h2 id="catalog-editor-title">{cable.savedAt ? '编辑线材档案' : '加入我的线材'}</h2>
    <p className="editor-intro">名称、照片和规格会保存在本机，用途建议随信息自动更新。</p>
    <fieldset disabled={disabled} className="editor-fields">
      <div className="editor-identity"><div className="photo-editor">{photo ? <img src={photo} alt="线材照片预览"/> : <div className="photo-placeholder"><Camera size={26}/><span>拍下接头和线身，更容易认出</span></div>}
        <label className="photo-upload">{processing ? '正在处理照片…' : photo ? '更换照片' : '添加照片'}<input type="file" aria-label="上传线材照片" accept="image/jpeg,image/png,image/webp" onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
          setProcessing(true); setError(''); try { setPhoto(await preparePhoto(file)) } catch (err) { setError(err instanceof Error ? err.message : '照片读取失败') } finally { setProcessing(false) }
        }}/></label>{photo && <button type="button" className="text-button remove-photo" onClick={() => setPhoto('')}><Trash2 size={12}/>移除照片</button>}</div>
        <div className="identity-fields"><label>自定义名称<input maxLength={80} required value={name} onChange={e => setName(e.target.value)} placeholder="例如：书桌黑色编织线"/></label><label>存放位置<input maxLength={120} value={location} onChange={e => setLocation(e.target.value)} placeholder="例如：书桌左侧 / 出行包"/></label><label>备注<textarea rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="长度、购入时间或常搭配的设备"/></label></div>
      </div>
      {cable.demo && <p className="editor-notice">这是演示线材，保存和导出后仍会标记为示例。</p>}
      {cable.presence === 'device' && cable.connectionScope !== 'external' && !cable.inventoryId && <label className="connection-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>我已确认这条连接对应手里的外接线，而非内置设备</label>}
      <details className="spec-editor" open={cable.evidence === 'manual'}><summary>补充线材规格<span>从包装、官网或已知型号填写</span></summary><p>留空会沿用检测结果或保持待确认。手动填写单独保存，并注明来源。</p>
        <div className="spec-form-grid">
          <label>两端接口<select aria-label="两端接口" value={specs.connector || ''} onChange={e => update('connector',e.target.value)}><option value="">沿用检测 / 待确认</option>{['USB-C ↔ USB-C','USB-A ↔ USB-C','USB-A ↔ Micro-USB','USB-C ↔ Lightning','USB-A ↔ Lightning'].map(v=><option key={v}>{v}</option>)}</select></label>
          <label>标称充电功率（W）<input type="number" min="1" max="500" step="0.1" value={specs.maxPowerW ?? ''} onChange={e => update('maxPowerW',e.target.value ? Number(e.target.value) : undefined)} placeholder="例如 60"/></label>
          <label>额定电流（A）<input type="number" min="0.1" max="20" step="0.1" value={specs.ratingCurrentA ?? ''} onChange={e => update('ratingCurrentA',e.target.value ? Number(e.target.value) : undefined)} placeholder="例如 3"/></label>
          <label>额定电压（V）<input type="number" min="1" max="60" step="0.1" value={specs.ratingVoltageV ?? ''} onChange={e => update('ratingVoltageV',e.target.value ? Number(e.target.value) : undefined)} placeholder="例如 20"/></label>
          <label>数据能力<select aria-label="数据能力" value={specs.kind || ''} onChange={e => update('kind',e.target.value)}><option value="">沿用检测 / 待确认</option><option value="data">可传数据</option><option value="power-only">已确认仅供电</option></select></label>
          <label>声明数据速度<select aria-label="声明数据速度" value={specs.dataLabel || ''} onChange={e => update('dataLabel',e.target.value)}><option value="">沿用检测 / 待确认</option>{['12 Mbps','480 Mbps','5 Gbps','10 Gbps','20 Gbps','40 Gbps','80 Gbps'].map(v=><option key={v}>{v}</option>)}</select></label>
          <label>EPR 高功率声明<select aria-label="EPR 高功率声明" value={specs.epr === undefined ? '' : String(specs.epr)} onChange={e => update('epr',e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">沿用检测 / 待确认</option><option value="true">资料明确支持 EPR</option><option value="false">资料明确不支持 EPR</option></select></label>
          <label>补充规格的依据<input value={specs.sourceNote || ''} maxLength={500} onChange={e=>update('sourceNote',e.target.value)} placeholder="例如：包装标签 / 官网型号"/></label>
        </div>
      </details>
    </fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="editor-actions"><button type="button" className="button secondary" disabled={disabled} onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={disabled || !confirmed || !name.trim()}>{saving ? '正在保存…' : '保存线材'}</button></div>
  </form></div>
}
