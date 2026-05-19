import type { AnyRouter } from '@trpc/server'
import { router } from '../trpc/procedures.js'
import { submissionRouter } from './submission.js'
import { reviewRouter } from './review.js'
import { proofReviewRouter } from './proofReview.js'
import { assetRouter } from './asset.js'
import { publicationRouter } from './publication.js'
import { tenantRouter }      from './tenant.js'
import { userRouter }        from './user.js'

type AppRouterType = ReturnType<typeof router>

export const appRouter: AppRouterType = router({
  submission:  submissionRouter,
  review:      reviewRouter,
  proofReview: proofReviewRouter,
  asset:       assetRouter,
  publication: publicationRouter,
  tenant:      tenantRouter,
  user:        userRouter,
})

export type AppRouter = typeof appRouter
