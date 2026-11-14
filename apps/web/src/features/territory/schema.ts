import { z } from 'zod'

/** H3 resolution 8 ≈ 460 m hex edge — a "neighbourhood"-sized cell. */
export const H3_RES = 8
export const COOLDOWN_MS = 60 * 60 * 1000 // a captured cell is locked for one hour
export const MAX_ACCURACY_M = 65 // reject a fix looser than this (urban GPS drifts ~15–20 m)
export const MAX_SPEED_KMH = 300 // faster than this between two captures = impossible travel

export const captureSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000),
})

export type Cell = { h3: string; teamId: string; nick: string; capturedAt: string }

export type CaptureReason = 'accuracy' | 'cooldown' | 'teleport' | 'error'
export type CaptureResult = { ok: true; cell: Cell } | { ok: false; reason: CaptureReason; message: string; until?: string }
