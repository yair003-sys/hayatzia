import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// A horizontal scroller with no positioned ancestor inside it lets an absolutely positioned child (a `sr-only`
// label) escape its clip and widen the whole page sideways on a phone (home page bug, 2026-10-16: the "likes on your
// own review" label pushed the page 107px wide). Every horizontal scroller is therefore its own containing block.
const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('globals.css horizontal scrollers', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*overflow-x:\s*auto[^{}]*)\}/g)].map((m) => ({ selector: (m[1] ?? '').trim(), body: m[2] ?? '' }))

  it('finds the scrollers', () => {
    expect(rules.map((r) => r.selector)).toEqual(expect.arrayContaining(['.hm-pcards', '.hm-stories', '.hm-reels', '.sh-bench']))
  })

  it.each(rules.map((r) => [r.selector, r.body]))('%s is position: relative', (_selector, body) => {
    expect(body).toMatch(/position:\s*relative/)
  })
})
