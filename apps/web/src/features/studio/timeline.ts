import { MAX_STUDIO_CLIPS, splitClip, trimmed, type StudioClip, type StudioProject } from './schema'

// The timeline engine: a pure reducer over the project with Undo/Redo. Every structural edit (trim, split, delete,
// reorder, duplicate, speed/filter) goes through here, so the whole editor shares one history. New ids for split and
// duplicate are supplied by the caller, which keeps the reducer pure and deterministic (and easy to test).

export type Studio = { past: StudioProject[]; present: StudioProject; future: StudioProject[] }

export type StudioAction =
  | { type: 'add'; clips: StudioClip[] }
  | { type: 'trim'; id: string; inSec: number; outSec: number }
  | { type: 'split'; id: string; atSrc: number; newId: string }
  | { type: 'remove'; id: string }
  | { type: 'reorder'; from: number; to: number }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'update'; id: string; patch: Partial<Pick<StudioClip, 'filter' | 'speed'>> }
  | { type: 'undo' }
  | { type: 'redo' }

export function initStudio(project: StudioProject): Studio {
  return { past: [], present: project, future: [] }
}

/** Replace the present project and record history (clears the redo stack). No-op edits keep the same reference. */
function commit(s: Studio, clips: StudioClip[]): Studio {
  if (clips === s.present.clips) return s
  return { past: [...s.past, s.present], present: { ...s.present, clips }, future: [] }
}

function move<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr.slice()
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

export function studioReducer(s: Studio, a: StudioAction): Studio {
  const clips = s.present.clips
  switch (a.type) {
    case 'add': {
      if (a.clips.length === 0) return s
      return commit(s, [...clips, ...a.clips].slice(0, MAX_STUDIO_CLIPS))
    }
    case 'trim': {
      const next = clips.map((c) => (c.id === a.id ? trimmed(c, a.inSec, a.outSec) : c))
      return commit(s, next)
    }
    case 'split': {
      const i = clips.findIndex((c) => c.id === a.id)
      if (i < 0) return s
      const parts = splitClip(clips[i]!, a.atSrc, a.newId)
      if (!parts) return s
      return commit(s, [...clips.slice(0, i), parts[0], parts[1], ...clips.slice(i + 1)])
    }
    case 'remove': {
      const next = clips.filter((c) => c.id !== a.id)
      return next.length === clips.length ? s : commit(s, next)
    }
    case 'reorder':
      return commit(s, move(clips, a.from, a.to))
    case 'duplicate': {
      const i = clips.findIndex((c) => c.id === a.id)
      if (i < 0 || clips.length >= MAX_STUDIO_CLIPS) return s
      const copy = { ...clips[i]!, id: a.newId }
      return commit(s, [...clips.slice(0, i + 1), copy, ...clips.slice(i + 1)])
    }
    case 'update': {
      const next = clips.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c))
      return commit(s, next)
    }
    case 'undo': {
      if (s.past.length === 0) return s
      const present = s.past[s.past.length - 1]!
      return { past: s.past.slice(0, -1), present, future: [s.present, ...s.future] }
    }
    case 'redo': {
      if (s.future.length === 0) return s
      const present = s.future[0]!
      return { past: [...s.past, s.present], present, future: s.future.slice(1) }
    }
  }
}

export const canUndo = (s: Studio) => s.past.length > 0
export const canRedo = (s: Studio) => s.future.length > 0
