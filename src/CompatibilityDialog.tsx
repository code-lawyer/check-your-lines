import { useEffect, useRef } from 'react'
import { CircleHelp, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import type { Cable, CompatibilityCheck } from './types'

export function CompatibilityDialog({busy,result,needsRestore,onRun,onSave,onClose}:{busy:boolean;result:CompatibilityCheck|null;needsRestore:boolean;onRun:(restore:boolean)=>void;onSave:(record:Cable)=>void;onClose:()=>void}) {
  const panel=useRef<HTMLDivElement>(null)
  useEffect(()=>{const old=document.activeElement as HTMLElement;panel.current?.focus();return()=>old?.focus()},[])
  const restore=needsRestore || result?.restored===false
  return <div className="modal-backdrop"><div ref={panel} tabIndex={-1} className="compatibility-dialog" role="dialog" aria-modal="true" aria-labelledby="compatibility-title" onKeyDown={e=>{
    if(e.key==='Escape'&&!busy) onClose()
    if(e.key==='Tab') {
      const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[])
      const first=buttons[0],last=buttons[buttons.length-1]
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
  }}><button className="modal-close icon-button" disabled={busy} aria-label="关闭兼容性检查" onClick={onClose}><X size={20}/></button>
    <span className="eyebrow">了解这台电脑的读取能力</span><h2 id="compatibility-title">{restore?'恢复 USB-C 设置':'电脑兼容性检查'}</h2>
    {busy?<div className="compatibility-progress" role="status"><LoaderCircle className="spin" size={24}/><p>请处理 Windows 管理员确认。正在检查 USB-C 控制器，结束后会恢复原设置。</p></div>:result?<div className="compatibility-result" role="status"><strong>{result.cancelled?'已取消检查':result.error?'检查未完成':result.restorationOnly?'系统设置已恢复':result.profile?.state==='firmware-limited'?'此电脑未开放线材规格读取':result.profile?.state==='data-available'?'已读取到线材数据':'兼容性检查结果'}</strong><p>{result.error||result.profile?.reason|| (result.cancelled?'没有开始新的诊断。':'已完成设置恢复。')}</p>{result.restored&&!result.cancelled&&<small><ShieldCheck size={14}/>已确认恢复原有系统设置</small>}</div>:<>
      <p className="compatibility-intro">检查电脑是否开放线材芯片和规格读取通道。结果会保存在本机；不会据此判定线材好坏。</p>
      <div className="compatibility-consent"><CircleHelp size={19}/><p>需要 Windows 管理员确认，会临时启用诊断接口并短暂重启 USB-C 控制器。请暂时停止 USB-C 文件传输。检查完成后恢复原设置，不安装驱动。</p></div>
    </>}
    {!!result?.records?.length && <div className="diagnostic-cables"><h3>本次读取的线材信息</h3><p>请按实物核对端口后保存。这些记录不会与设备连接重复计数，也不会自动认作已保存的某根线。</p>{result.records.map(c=><article key={c.id}><div><b>{c.portLabel}</b><small>{c.connector}</small><span>{c.maxPowerW?`${c.maxPowerW} W`:'功率未读取'} · {c.ratingCurrentA?`${c.ratingCurrentA} A`:'电流未读取'} · {c.dataLabel||'数据等级未读取'}</span><small>{c.sourceLabel}</small></div><button className="button secondary" onClick={()=>onSave(c)}>记录这根线</button></article>)}</div>}
    <div className="editor-actions"><button className="button secondary" disabled={busy} onClick={onClose}>{result?'关闭':'暂不检查'}</button>{(!result||restore||result.cancelled)&&<button className="button primary" disabled={busy} onClick={()=>onRun(restore)}>{restore?'恢复设置':'开始检查'}</button>}</div>
  </div></div>
}
