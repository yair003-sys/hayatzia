'use server'

import { z } from 'zod'
import { getLeague } from '@/features/matches/server/queries'
import { actionClient } from '@/lib/safe-action'

/** The ticket's match from the cached league data: a cheap read for the live score, instead of re-rendering the page. */
export const ticketFixtureAction = actionClient
  .inputSchema(z.object({ fixtureId: z.number().int().positive() }))
  .action(async ({ parsedInput: { fixtureId } }) => ({
    fixture: (await getLeague())?.fixtures.find((f) => f.id === fixtureId) ?? null,
  }))
