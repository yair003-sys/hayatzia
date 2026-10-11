import Link from 'next/link'
import { TEAMS } from '@/features/teams/data'
import { TeamScarf } from '@/features/teams/components/team-scarf'

export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 pt-16 pb-10">
      <header className="font-display text-xl font-extrabold tracking-tight">היציע</header>

      <section className="space-y-4">
        <p className="text-sm font-semibold text-ok">ליגת העל · 2026/27</p>
        <h1 className="font-display text-5xl leading-[1.05] font-black">
          רק אוהדים
          <br />
          אמיתיים.
        </h1>
        <p className="text-lg text-muted">קהילה פרטית לכל קבוצה. כל אוהד מאומת, וקבוצה אחת לכל החיים.</p>
        <ul className="flex flex-wrap gap-1.5 pt-2" aria-label="קבוצות ליגת העל">
          {TEAMS.map((t) => (
            <li key={t.id} title={t.name}>
              <TeamScarf team={t} />
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-3">
        <Link
          href="/stand"
          className="block rounded-lg bg-accent py-4 text-center text-lg font-bold text-white shadow-[0_8px_30px_rgb(109_74_255/0.4)] transition-transform active:scale-[0.98]"
        >
          כניסה ליציע
        </Link>
        <p className="text-center text-xs text-dim">גרסה חדשה בבנייה. ההתחברות תתווסף בשלב הבא.</p>
      </div>
    </main>
  )
}
