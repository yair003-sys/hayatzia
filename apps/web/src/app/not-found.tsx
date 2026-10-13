import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl font-black">הדף לא נמצא</h1>
      <p className="text-muted">אולי הקישור ישן, או שהדף עבר מקום.</p>
      <Link href="/stand" className="rounded-lg bg-accent px-5 py-3 font-bold text-white">
        חזרה לדף הבית
      </Link>
    </main>
  )
}
