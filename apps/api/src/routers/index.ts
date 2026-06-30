import { router } from '../trpc/procedures.js'
import { analyticsRouter }   from './analytics.js'
import { submissionRouter }  from './submission.js'
import { reviewRouter }      from './review.js'
import { proofReviewRouter } from './proofReview.js'
import { copyEditRouter }    from './copyEdit.js'
import { issueRouter }       from './issue.js'
import { assetRouter }       from './asset.js'
import { publicationRouter } from './publication.js'
import { tenantRouter }      from './publication.js'
import { userRouter }        from './user.js'
import { typeSettingRouter } from './typesetting.js'

export const appRouter = router({
  analytics:   analyticsRouter,
  submission:  submissionRouter,
  review:      reviewRouter,
  proofReview: proofReviewRouter,
  copyEdit:    copyEditRouter,
  issue:       issueRouter,
  asset:       assetRouter,
  publication: publicationRouter,
  tenant:      tenantRouter,
  user:        userRouter,
  typesetting: typeSettingRouter,
})

export type AppRouter = typeof appRouter
