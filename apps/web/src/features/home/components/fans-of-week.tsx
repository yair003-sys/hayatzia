import { initialOf, MEDALS } from '../schema'
import { SectionHead } from './section-head'

/** "🏆 אוהדי השבוע": always shown; before anyone has points this week it says how to get in. */
export function FansOfWeek({ fans }: { fans: { nick: string; points: number }[] }) {
  return (
    <section aria-labelledby="hm-fans-h" className="hm-sec">
      <SectionHead id="hm-fans-h" emoji="🏆" title="אוהדי השבוע" />
      {fans.length === 0 ? (
        <p className="hm-empty">עוד אין אוהדים מצטיינים השבוע — נחש, דרג והעלה לכיכר כדי להיכנס לרשימה</p>
      ) : (
        <ol className="hm-fans">
          {fans.map((f, i) => (
            <li key={i} className="hm-fan">
              <span className="text-xl" aria-hidden="true">
                {MEDALS[i]}
              </span>
              <span className="sr-only">מקום {i + 1}:</span>
              <span className="hm-fan-av" aria-hidden="true">
                {initialOf(f.nick)}
              </span>
              <b className="hm-fan-nick">{f.nick}</b>
              <span className="text-[11px] text-muted">
                <span className="t-num">{f.points.toLocaleString('he-IL')}</span> נק׳
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
