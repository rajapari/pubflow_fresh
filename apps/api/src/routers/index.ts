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
import { billingRouter }     from './billing.js'
import { grammarRouter }     from './grammar.js'
import { portalRouter }      from './portal.js'
import { styleProfileRouter } from './styleProfile.js'
import { layoutTemplateRouter } from './layoutTemplate.js'

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
  billing:     billingRouter,
  grammar:      grammarRouter,
  portal:       portalRouter,
  styleProfile: styleProfileRouter,
  layoutTemplate: layoutTemplateRouter,
})

export type AppRouter = typeof appRouter
