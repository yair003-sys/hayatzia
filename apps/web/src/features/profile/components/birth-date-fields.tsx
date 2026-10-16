'use client'

import { useId, useState } from 'react'
import { birthDateOf, todayIso } from '@/features/first-run/schema'

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/**
 * Day / month / year (right to left), with the reason in one line. Calls onChange with YYYY-MM-DD, or '' while a field
 * is empty. The full check (16+, a real date) is the schema's and the database's.
 */
export function BirthDateFields({ initial = '', onChange }: { initial?: string; onChange: (iso: string) => void }) {
  const id = useId()
  const [y0 = '', m0 = '', d0 = ''] = initial ? initial.split('-').map((p) => String(Number(p))) : []
  const [day, setDay] = useState(d0)
  const [month, setMonth] = useState(m0)
  const [year, setYear] = useState(y0)
  const thisYear = Number(todayIso().slice(0, 4))
  const years = Array.from({ length: thisYear - 1900 + 1 }, (_, i) => String(thisYear - i))
  const set = (d: string, m: string, y: string) => {
    setDay(d)
    setMonth(m)
    setYear(y)
    onChange(birthDateOf(d, m, y))
  }
  const select = 'su-field min-h-11 w-full bg-transparent px-2'
  return (
    <fieldset aria-describedby={`${id}-why`} className="space-y-2">
      <legend className="mb-2 block text-[13px] text-muted">תאריך לידה</legend>
      <div className="grid grid-cols-[1fr_1.4fr_1.2fr] gap-2">
        <label>
          <span className="sr-only">יום</span>
          <select className={select} value={day} onChange={(e) => set(e.target.value, month, year)}>
            <option value="">יום</option>
            {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">חודש</span>
          <select className={select} value={month} onChange={(e) => set(day, e.target.value, year)}>
            <option value="">חודש</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">שנה</span>
          <select className={select} value={year} onChange={(e) => set(day, month, e.target.value)}>
            <option value="">שנה</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id={`${id}-why`} className="text-xs text-dim">
        כדי להגן על בני נוער. לא מוצג לאף אחד
      </p>
    </fieldset>
  )
}
