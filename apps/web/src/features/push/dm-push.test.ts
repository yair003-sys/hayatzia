import { describe, expect, it } from 'vitest'
import { dmPushPayload } from './schema'

const THREAD = '00000000-0000-4000-8000-0000000000aa'

describe('dmPushPayload (no message text, ever)', () => {
  it('a message request says who asks, and nothing else', () => {
    const p = dmPushPayload({ threadId: THREAD, senderNick: 'יאיר', request: true })
    expect(p).toEqual({ title: 'בקשת הודעה', body: 'בקשת הודעה מ-יאיר', url: `/inbox/${THREAD}`, tag: `dm:${THREAD}` })
    expect(Object.keys(p).sort()).toEqual(['body', 'tag', 'title', 'url'])
  })

  it('a message in an accepted chat keeps the old copy', () => {
    expect(dmPushPayload({ threadId: THREAD, senderNick: 'יאיר', request: false })).toEqual({
      title: 'הודעה פרטית חדשה',
      body: 'מ־יאיר',
      url: `/inbox/${THREAD}`,
      tag: `dm:${THREAD}`,
    })
  })
})
