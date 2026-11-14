import { z } from 'zod'
import type { Clip } from '@/features/square/schema'

export const SEARCH_MIN = 1
export const SEARCH_MAX = 60

export const searchSchema = z.object({ q: z.string().trim().min(SEARCH_MIN).max(SEARCH_MAX) })

export type FanHit = { userId: string; nick: string; teamId: string; avatarUrl: string | null; followers: number }
export type PostHit = { id: string; teamId: string; authorId: string; authorNick: string; title: string | null; body: string; official: boolean; createdAt: string }

/** One round of search: people, wall posts and clips, each already ranked by the database. */
export type SearchResults = { fans: FanHit[]; posts: PostHit[]; clips: Clip[] }

export type SearchTab = 'fans' | 'posts' | 'clips'
