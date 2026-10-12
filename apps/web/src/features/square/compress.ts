'use client'

import { fitWithin, shouldShrink } from './schema'

/**
 * Phone photos are often 3–10 MB; the Square shows them on a phone screen. Shrink to 1600 px on the long side as JPEG
 * (~200–400 KB) so the upload takes a second instead of half a minute. Falls back to the original on any problem.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!shouldShrink(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
