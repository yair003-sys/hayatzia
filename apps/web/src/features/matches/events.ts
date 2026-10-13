// Match events (goals, cards, substitutions, VAR) as Hebrew timeline rows. Stub: implemented after the red run.
import type { FixtureDetail } from './schema'

export type FixtureEvent = FixtureDetail['ev'][number]
export type EventKind = 'goal' | 'own-goal' | 'penalty' | 'missed-penalty' | 'yellow' | 'red' | 'sub' | 'var' | 'other'
export type EventView = { kind: EventKind; label: string; player: string; extra: string; minute: string; team: number }

export function minuteText(_m: number, _x: number): string {
  return ''
}

export function eventView(e: FixtureEvent): EventView {
  return { kind: 'other', label: '', player: '', extra: '', minute: '', team: e.team }
}

export function timeline(_ev: FixtureEvent[]): (EventView & { key: string })[] {
  return []
}
