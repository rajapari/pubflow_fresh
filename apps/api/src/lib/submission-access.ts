import type { PrismaClient } from '@pubflow/db'
import type { AuthUser } from '@pubflow/types'

/**
 * Can this user view a submission's manuscript (editor URL, WOPI file
 * endpoints, downloads)? Tenant match is a precondition the caller must
 * check separately — this only decides role/ownership within the tenant.
 *
 * - The author always can.
 * - Production/editorial staff always can (they need to see the manuscript
 *   at the stage they're working it).
 * - A PEER_REVIEWER can only see submissions they are actually assigned to
 *   review — blind review confidentiality.
 * - READER (public-browse role) never gets pre-publication access.
 */
export async function canAccessManuscript(
  prisma: PrismaClient,
  user: AuthUser,
  submission: { id: string; authorId: string },
): Promise<boolean> {
  if (submission.authorId === user.id) return true
  if (user.role === 'READER') return false
  if (user.role === 'PEER_REVIEWER') {
    const assigned = await prisma.review.findFirst({
      where: { submissionId: submission.id, reviewerId: user.id },
      select: { id: true },
    })
    return Boolean(assigned)
  }
  // Every other role (editors, copy editor, artwork editor, typesetter,
  // proof reader, super admin) is tenant staff with legitimate access.
  return true
}
