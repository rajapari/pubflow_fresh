import { z } from 'zod'

export const UserRoleSchema = z.enum([
  'SUPER_ADMIN','EDITOR_IN_CHIEF','SECTION_EDITOR','COPY_EDITOR',
  'ARTWORK_EDITOR','TYPESETTER','PROOF_READER','PEER_REVIEWER','AUTHOR','READER',
])
export type UserRole = z.infer<typeof UserRoleSchema>

export const PlanSchema = z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
export type Plan = z.infer<typeof PlanSchema>

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  keycloakId: z.string(),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  orcid: z.string().nullable(),
  role: UserRoleSchema,
})
export type AuthUser = z.infer<typeof AuthUserSchema>

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100, EDITOR_IN_CHIEF: 80, SECTION_EDITOR: 60,
  COPY_EDITOR: 50, ARTWORK_EDITOR: 50, TYPESETTER: 50, PROOF_READER: 40,
  PEER_REVIEWER: 30, AUTHOR: 20, READER: 10,
}

export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
