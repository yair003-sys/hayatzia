// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const mocks = vi.hoisted(() => ({ getBannerAlert: vi.fn() }))
vi.mock('@/features/push/server/banner-alert', () => ({ getBannerAlert: mocks.getBannerAlert }))

const call = (id: string) => GET(new Request(`http://localhost/api/alerts/${id}`), { params: Promise.resolve({ id }) })
const alert = { title: '⚽ שער! א 1:0 ב', body: "12′", homeApiId: 604, awayApiId: 657, bar: '#FFD400' }

beforeEach(() => {
  mocks.getBannerAlert.mockReset()
})

describe('GET /api/alerts/[id]', () => {
  it('returns the banner text, shareable by the CDN for a minute', async () => {
    mocks.getBannerAlert.mockResolvedValue(alert)
    const res = await call('42')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(alert)
    expect(res.headers.get('cache-control')).toContain('s-maxage=60')
    expect(mocks.getBannerAlert).toHaveBeenCalledWith(42)
  })

  it('404 for an unknown alert, not cached', async () => {
    mocks.getBannerAlert.mockResolvedValue(null)
    const res = await call('42')
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('404 for a malformed id without reading anything', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '9'.repeat(17)]) expect((await call(id)).status).toBe(404)
    expect(mocks.getBannerAlert).not.toHaveBeenCalled()
  })
})
