export async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 照片')
  if (file.size > 15 * 1024 * 1024) throw new Error('照片请小于 15 MB')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('照片处理失败，请重试')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.82, 0.65, 0.48, 0.3]) { const url = canvas.toDataURL('image/jpeg', quality); if (url.length <= 180000) return url }
    throw new Error('照片细节过多，请裁剪后重试')
  } finally { bitmap.close() }
}
