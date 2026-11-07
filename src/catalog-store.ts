import { normalizeCatalog } from '../shared/catalog.mjs'
import type { Cable } from './types'

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cablewise-catalog', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('catalog')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function loadCatalog(): Promise<Cable[]> {
  let records: Cable[] | null
  if (window.cablewise) records = (await window.cablewise.loadCatalog()).records
  else {
    const db = await database()
    records = await new Promise<Cable[] | null>((resolve, reject) => {
      const tx = db.transaction('catalog', 'readonly'); const req = tx.objectStore('catalog').get('records')
      req.onsuccess = () => resolve(req.result ?? null); req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close(); tx.onabort = () => { db.close(); reject(tx.error) }
    })
  }
  if (records !== null) return normalizeCatalog(records) as Cable[]
  const legacy = JSON.parse(localStorage.getItem('cablewise.saved.v1') || '[]')
  if (Array.isArray(legacy) && legacy.length) return saveCatalog(normalizeCatalog(legacy) as Cable[])
  return []
}
export async function saveCatalog(records: Cable[]): Promise<Cable[]> {
  const clean = normalizeCatalog(records) as Cable[]
  if (window.cablewise) return window.cablewise.saveCatalog(clean)
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('catalog', 'readwrite'); tx.objectStore('catalog').put(clean, 'records')
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('本地存储写入失败')) }
  })
  return clean
}
