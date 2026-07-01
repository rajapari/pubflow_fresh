import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/procedures.js'

const LT_URL = process.env.LANGUAGETOOL_URL ?? 'http://localhost:8082'

export const grammarRouter = router({
  check: protectedProcedure
    .input(z.object({
      text:     z.string().min(1).max(50_000),
      language: z.string().default('en-US'),
    }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(`${LT_URL}/v2/check`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({ language: input.language, text: input.text }),
          signal:  AbortSignal.timeout(10_000),
        })
        if (!res.ok) throw new Error(`LanguageTool returned ${res.status}`)

        const data = await res.json() as {
          matches: Array<{
            message:     string
            shortMessage: string
            offset:      number
            length:      number
            replacements: Array<{ value: string }>
            rule: { id: string; description: string; issueType: string }
            context: { text: string; offset: number; length: number }
          }>
        }
        return { matches: data.matches }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: `Grammar check unavailable: ${err.message}` })
      }
    }),
})
