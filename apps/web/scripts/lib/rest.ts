// Minimal Supabase REST client for CI scripts (no npm install): PostgREST + Storage with the secret key.
export function supabaseFromEnv() {
  const base = process.env.SUPABASE_URL
  // Pasting from a Hebrew (RTL) keyboard can add invisible direction marks: strip whitespace and format characters.
  const key = process.env.SUPABASE_SECRET_KEY?.replace(/[\s\p{Cf}]/gu, '')
  if (!base || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY')
    process.exit(1)
  }
  if (!/^[\x21-\x7e]+$/.test(key)) {
    console.error(`SUPABASE_SECRET_KEY is not a plain key (length ${key.length}): copy the full key after revealing it`)
    process.exit(1)
  }
  const headers = { apikey: key, 'Content-Type': 'application/json' }

  async function call(method: string, url: string, body?: unknown, prefer?: string): Promise<Response> {
    const res = await fetch(url, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${url.replace(base!, '')} → ${res.status} ${await res.text()}`)
    return res
  }

  return {
    rest: (method: string, pathAndQuery: string, body?: unknown, prefer?: string) =>
      call(method, `${base}/rest/v1/${pathAndQuery}`, body, prefer),
    storage: (method: string, path: string, body?: unknown) => call(method, `${base}/storage/v1/${path}`, body),
  }
}

export function notice(title: string, message: string) {
  console.log(message)
  // Shows up as an annotation on the run (readable through the GitHub API, unlike raw logs).
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=${title}::${message}`)
}
