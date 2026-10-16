import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const q = vi.hoisted(() => ({
  toString: vi.fn(async (text: string, opts?: unknown) => {
    void text
    void opts
    return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
  }),
}))
vi.mock('qrcode', () => ({ toString: q.toString, default: { toString: q.toString } }))
vi.mock('../server/actions', () => ({ resetQrAction: vi.fn(), openByCodeAction: vi.fn() }))

import { AddCard } from './add-card'
import { codeFromScan, MyQr } from './my-qr'

afterEach(cleanup)

const CODE = 'abcDEF123_-abcDEF123_-x'

describe('MyQr', () => {
  it('draws the add page of this site as a QR image, on the device', async () => {
    render(<MyQr code={CODE} nick="יאיר" origin="https://onefan.example" />)
    const img = await screen.findByRole('img', { name: 'הברקוד שלי' })
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(q.toString).toHaveBeenCalledWith(`https://onefan.example/add/${CODE}`, expect.objectContaining({ type: 'svg' }))
    expect(screen.getByRole('button', { name: 'חדש ברקוד' })).toBeInTheDocument()
  })
})

describe('AddCard (/add/<code>)', () => {
  it('a bad or reset code says so', () => {
    render(<AddCard code={CODE} card={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('הברקוד לא תקף')
    expect(screen.queryByRole('button', { name: 'שלח הודעה' })).toBeNull()
  })
  it('a good code shows the fan and "שלח הודעה"', () => {
    render(<AddCard code={CODE} card={{ nick: 'יריב', teamId: 'hta' }} />)
    expect(screen.getByText('יריב')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שלח הודעה' })).toBeInTheDocument()
  })
})

describe('codeFromScan', () => {
  it('reads our add link or a bare code, nothing else', () => {
    expect(codeFromScan(`https://onefan.example/add/${CODE}`)).toBe(CODE)
    expect(codeFromScan(`https://onefan.example/add/${CODE}?x=1`)).toBe(CODE)
    expect(codeFromScan(CODE)).toBe(CODE)
    expect(codeFromScan('https://example.com/other')).toBeNull()
  })
})
