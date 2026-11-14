'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { Map as LMap, LayerGroup, Polygon, CircleMarker } from 'leaflet'
import { Crosshair, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { teamById } from '@/features/teams/data'
import { captureTerritoryAction } from '../server/actions'
import type { Cell } from '../schema'

const ISRAEL: [number, number] = [31.6, 34.9]
const colorOf = (teamId: string) => teamById(teamId)?.bar ?? '#8a8f98'

/**
 * The live territory map. Leaflet is loaded in the browser only (it touches `window`), hexes are drawn from their H3
 * boundaries and coloured by the holding club, and Supabase Realtime repaints a cell the moment it changes hands.
 */
export function TerritoryMap({ initial, myTeamId }: { initial: Cell[]; myTeamId: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)
  const hexRef = useRef<Map<string, { poly: Polygon; teamId: string }>>(new Map())
  const meRef = useRef<CircleMarker | null>(null)
  const [tally, setTally] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Recompute the per-club tally from whatever cells are drawn.
  const retally = () => {
    const t: Record<string, number> = {}
    for (const { teamId } of hexRef.current.values()) t[teamId] = (t[teamId] ?? 0) + 1
    setTally(t)
  }

  useEffect(() => {
    let map: LMap | null = null
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
    let cancelled = false

    void (async () => {
      const L = (await import('leaflet')).default
      const { cellToBoundary } = await import('h3-js')
      if (cancelled || !boxRef.current) return

      map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView(ISRAEL, 8)
      mapRef.current = map
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
      const layer = L.layerGroup().addTo(map)
      layerRef.current = layer

      const draw = (cell: Cell) => {
        const ring = cellToBoundary(cell.h3).map(([lat, lng]) => [lat, lng]) as [number, number][]
        const color = colorOf(cell.teamId)
        const existing = hexRef.current.get(cell.h3)
        if (existing) {
          existing.poly.setStyle({ color, fillColor: color })
          existing.teamId = cell.teamId
        } else {
          const poly = L.polygon(ring, { color, fillColor: color, weight: 1, opacity: 0.9, fillOpacity: 0.4 }).addTo(layer)
          poly.bindTooltip(`${cell.nick} · ${teamById(cell.teamId)?.short ?? ''}`)
          hexRef.current.set(cell.h3, { poly, teamId: cell.teamId })
        }
      }

      for (const c of initial) draw(c)
      retally()

      // Centre on the fan if we can; the map still works if they decline.
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          if (cancelled || !map) return
          const here: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          map.setView(here, 15)
          meRef.current = L.circleMarker(here, { radius: 7, color: '#fff', weight: 2, fillColor: '#2b8aef', fillOpacity: 1 }).addTo(map)
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      )

      // Live: repaint a cell the instant it is captured by anyone.
      const supabase = createClient()
      if (supabase) {
        channel = supabase
          .channel('territory')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'territory' }, (payload) => {
            const row = payload.new as { h3: string; team_id: string; nick: string; captured_at: string } | null
            if (!row?.h3) return
            draw({ h3: row.h3, teamId: row.team_id, nick: row.nick, capturedAt: row.captured_at })
            retally()
          })
          .subscribe()
      }
    })()

    return () => {
      cancelled = true
      if (channel) void createClient()?.removeChannel(channel)
      map?.remove()
      mapRef.current = null
      hexRef.current = new Map()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const capture = () => {
    if (!navigator.geolocation) {
      setNote('אין גישה למיקום במכשיר הזה.')
      return
    }
    setBusy(true)
    setNote('מאתר מיקום…')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        const r = await captureTerritoryAction({ lat, lng, accuracy })
        setBusy(false)
        const res = r?.data
        if (res?.ok) {
          setNote('כבשתם את האזור! 🎉')
          const map = mapRef.current
          if (map) map.setView([lat, lng], Math.max(map.getZoom(), 15))
        } else {
          setNote(res?.message ?? 'לא הצלחנו לכבוש כרגע.')
        }
      },
      () => {
        setBusy(false)
        setNote('לא הצלחנו לקבל מיקום. אשרו הרשאת מיקום ונסו שוב.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const top = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="h-[62vh] w-full overflow-hidden rounded-2xl border border-line" role="application" aria-label="מפת מלחמת שכונות" />

      {top.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {top.map(([teamId, n]) => (
            <li key={teamId} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: colorOf(teamId) }} />
              <b>{teamById(teamId)?.short ?? teamId}</b>
              <span className="t-num text-muted">{n}</span>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="text-center text-sm text-muted" aria-live="polite">{note}</p>}

      <button
        type="button"
        onClick={capture}
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold text-white disabled:opacity-60"
        style={{ background: colorOf(myTeamId) }}
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Crosshair className="size-5" aria-hidden="true" />}
        כבוש את האזור שלי
      </button>
    </div>
  )
}
