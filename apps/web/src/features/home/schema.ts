// Home ("onefan" tab, redesign 2026-10-14): pure helpers. Stubs: tests first.
import type { Fixture } from '@/features/matches/schema'

const todo = (): never => {
  throw new Error('not implemented')
}

export function reviewIndex(_tick: number, _card: number, _len: number): number {
  return todo()
}

export function shouldRotate(_s: { visible: boolean; reducedMotion: boolean; pageHidden: boolean; held: boolean }): boolean {
  return todo()
}

export type StoryClip = { id: string; user_id: string; nick: string; created_at: string; seen: boolean }
export type StoryGroup<T extends StoryClip> = { userId: string; nick: string; clips: T[]; seen: boolean; latest: string }

export function groupStories<T extends StoryClip>(_clips: T[], _opts: { me: string; blocked: readonly string[]; max?: number }): StoryGroup<T>[] {
  return todo()
}

export function storyStart<T extends StoryClip>(_group: StoryGroup<T>): number {
  return todo()
}

export function flattenStories<T extends StoryClip>(_groups: StoryGroup<T>[]): { items: { clip: T; group: number }[]; starts: number[] } {
  return todo()
}

export function tableWindow<T extends { team: number }>(_rows: T[], _clubIds: readonly number[]): T[] {
  return todo()
}

export function countdownParts(_ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  return todo()
}

export function countdownCells(_ms: number): { value: string; unit: string }[] {
  return todo()
}

export function countdownLabel(_ms: number): string {
  return todo()
}

export function homeCircles(_fixtures: Fixture[], _clubIds: readonly number[], _nowMs: number): { lineup: Fixture | null; rate: Fixture | null } {
  return todo()
}

export function initialOf(_nick: string): string {
  return todo()
}
