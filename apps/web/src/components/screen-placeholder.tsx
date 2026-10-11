/** Static placeholder used by P0 screens until their feature lands. Shows skeleton rows, never fake data. */
export function ScreenPlaceholder({ title, phase, note }: { title: string; phase: string; note: string }) {
  return (
    <section className="space-y-5">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-black">{title}</h1>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{phase}</span>
      </header>
      <p className="text-muted">{note}</p>
      <div className="space-y-3" aria-hidden="true">
        <div className="skeleton h-28 rounded-lg" />
        <div className="skeleton h-16 rounded-lg" />
        <div className="skeleton h-16 rounded-lg" />
      </div>
    </section>
  )
}
