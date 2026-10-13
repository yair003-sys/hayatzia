// Live-centre helpers (TDD stub: implemented in the next commit).
import type { Fixture } from './schema'

const todo = (): never => {
  throw new Error('not implemented')
}

export function israelDayKey(_unixSeconds: number): string {
  return todo()
}

export type StripDay = { key: string; weekday: string; day: number; hasGames: boolean; today: boolean }

export function dayStrip(_todayKey: string, _fixtures: Fixture[]): StripDay[] {
  return todo()
}

export function fixturesOn(_dayKey: string, _fixtures: Fixture[]): Fixture[] {
  return todo()
}

export function liveNow(_fixtures: Fixture[], _nowMs: number): Fixture[] {
  return todo()
}

export type LineupEntry = { n: number | null; p: string; pos: string; g: string | null }
export type PitchSpot = { n: number | null; name: string; x: number; y: number }

export function pitchSpots(_xi: LineupEntry[]): PitchSpot[] | null {
  return todo()
}

export function initials(_name: string): string {
  return todo()
}
