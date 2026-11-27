import { describe, expect, it } from 'vitest'
import { clipAt, segDuration, splitClip, totalDuration, trimmed, type StudioClip, type StudioProject } from './schema'
import { canRedo, canUndo, initStudio, studioReducer } from './timeline'

const clip = (id: string, over: Partial<StudioClip> = {}): StudioClip => ({
  id,
  sourceId: `src-${id}`,
  kind: 'video',
  url: `blob:${id}`,
  srcDuration: 10,
  inSec: 0,
  outSec: 10,
  speed: 1,
  filter: 'none',
  ...over,
})

const project = (clips: StudioClip[]): StudioProject => ({ id: 'p', clips })

describe('schema helpers', () => {
  it('segment duration divides the trim window by speed', () => {
    expect(segDuration(clip('a'))).toBe(10)
    expect(segDuration(clip('a', { speed: 2 }))).toBe(5)
    expect(segDuration(clip('a', { inSec: 2, outSec: 8 }))).toBe(6)
  })
  it('total duration sums the segments', () => {
    expect(totalDuration([clip('a', { outSec: 4 }), clip('b', { outSec: 6 })])).toBe(10)
  })
  it('clipAt finds the segment playing at a timeline time', () => {
    const clips = [clip('a', { outSec: 4 }), clip('b', { outSec: 6 })]
    expect(clipAt(clips, 1)).toEqual({ index: 0, offset: 1 })
    expect(clipAt(clips, 5)).toEqual({ index: 1, offset: 1 })
  })
  it('trim clamps inside the source and keeps a minimum length', () => {
    const t = trimmed(clip('a'), -5, 100)
    expect(t.inSec).toBe(0)
    expect(t.outSec).toBe(10)
    const tight = trimmed(clip('a'), 5, 5)
    expect(tight.outSec).toBeGreaterThan(tight.inSec)
  })
  it('split returns two windows, or null near an edge', () => {
    const parts = splitClip(clip('a'), 4, 'b')
    expect(parts).not.toBeNull()
    expect(parts![0].outSec).toBe(4)
    expect(parts![1].id).toBe('b')
    expect(parts![1].inSec).toBe(4)
    expect(parts![1].outSec).toBe(10)
    expect(splitClip(clip('a'), 0.1, 'b')).toBeNull()
  })
})

describe('studio reducer', () => {
  it('adds clips and caps at the max', () => {
    let s = initStudio(project([]))
    s = studioReducer(s, { type: 'add', clips: [clip('a'), clip('b')] })
    expect(s.present.clips.map((c) => c.id)).toEqual(['a', 'b'])
  })
  it('splits a clip into two consecutive segments', () => {
    let s = initStudio(project([clip('a')]))
    s = studioReducer(s, { type: 'split', id: 'a', atSrc: 4, newId: 'a2' })
    expect(s.present.clips.map((c) => c.id)).toEqual(['a', 'a2'])
    expect(s.present.clips[0]!.outSec).toBe(4)
    expect(s.present.clips[1]!.inSec).toBe(4)
  })
  it('removes, reorders and duplicates', () => {
    let s = initStudio(project([clip('a'), clip('b'), clip('c')]))
    s = studioReducer(s, { type: 'remove', id: 'b' })
    expect(s.present.clips.map((c) => c.id)).toEqual(['a', 'c'])
    s = studioReducer(s, { type: 'reorder', from: 0, to: 1 })
    expect(s.present.clips.map((c) => c.id)).toEqual(['c', 'a'])
    s = studioReducer(s, { type: 'duplicate', id: 'c', newId: 'c2' })
    expect(s.present.clips.map((c) => c.id)).toEqual(['c', 'c2', 'a'])
  })
  it('updates a segment filter and speed', () => {
    let s = initStudio(project([clip('a')]))
    s = studioReducer(s, { type: 'update', id: 'a', patch: { filter: 'vivid', speed: 2 } })
    expect(s.present.clips[0]!.filter).toBe('vivid')
    expect(s.present.clips[0]!.speed).toBe(2)
  })
  it('undoes and redoes through history', () => {
    let s = initStudio(project([clip('a')]))
    expect(canUndo(s)).toBe(false)
    s = studioReducer(s, { type: 'add', clips: [clip('b')] })
    s = studioReducer(s, { type: 'remove', id: 'a' })
    expect(s.present.clips.map((c) => c.id)).toEqual(['b'])
    s = studioReducer(s, { type: 'undo' })
    expect(s.present.clips.map((c) => c.id)).toEqual(['a', 'b'])
    expect(canRedo(s)).toBe(true)
    s = studioReducer(s, { type: 'undo' })
    expect(s.present.clips.map((c) => c.id)).toEqual(['a'])
    s = studioReducer(s, { type: 'redo' })
    expect(s.present.clips.map((c) => c.id)).toEqual(['a', 'b'])
  })
  it('a new edit after undo clears the redo stack', () => {
    let s = initStudio(project([clip('a')]))
    s = studioReducer(s, { type: 'add', clips: [clip('b')] })
    s = studioReducer(s, { type: 'undo' })
    s = studioReducer(s, { type: 'add', clips: [clip('c')] })
    expect(canRedo(s)).toBe(false)
    expect(s.present.clips.map((c) => c.id)).toEqual(['a', 'c'])
  })
})
