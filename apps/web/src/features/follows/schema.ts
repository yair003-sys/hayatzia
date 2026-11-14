import { z } from 'zod'

export const toggleFollowSchema = z.object({ followeeId: z.uuid(), on: z.boolean() })
