'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'

export const reportEmergencyAction = actionClient
  .inputSchema(z.strictObject({ tripId: z.uuid() }))
  .action(async () => ({ error: 'not implemented' }) as { ok?: true; created?: boolean; error?: string })
