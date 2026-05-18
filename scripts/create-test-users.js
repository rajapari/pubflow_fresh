#!/usr/bin/env node
/**
 * Create test users in Keycloak and database for Phase 2 testing
 * Usage: pnpm test:users
 */

import { PrismaClient } from '@pubflow/db'

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080'
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'pubflow'
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'pubflow-api'
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || 'CHANGE_ME_KEYCLOAK'
const KEYCLOAK_ADMIN = 'admin'
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'Admin@PubFlow2025'

const prisma = new PrismaClient()

// Test users to create
const TEST_USERS = [
  { username: 'author1', email: 'author1@pubflow.local', firstName: 'Alice', lastName: 'Author', password: 'password123', roles: ['AUTHOR'] },
  { username: 'author2', email: 'author2@pubflow.local', firstName: 'Bob', lastName: 'Author', password: 'password123', roles: ['AUTHOR'] },
  { username: 'reviewer1', email: 'reviewer1@pubflow.local', firstName: 'Carol', lastName: 'Reviewer', password: 'password123', roles: ['PEER_REVIEWER'] },
  { username: 'reviewer2', email: 'reviewer2@pubflow.local', firstName: 'David', lastName: 'Reviewer', password: 'password123', roles: ['PEER_REVIEWER'] },
  { username: 'editor', email: 'editor@pubflow.local', firstName: 'Emma', lastName: 'Editor', password: 'password123', roles: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] },
  { username: 'admin', email: 'admin@pubflow.local', firstName: 'Frank', lastName: 'Admin', password: 'password123', roles: ['SUPER_ADMIN'] },
]

async function getAdminToken() {
  console.log('🔑 Getting admin token from Keycloak...')
  const response = await fetch(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      username: KEYCLOAK_ADMIN,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get admin token: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

async function getUserByUsername(adminToken, username) {
  const response = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=${username}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  )
  const users = await response.json()
  return users[0]
}

async function createKeycloakUser(adminToken, user) {
  console.log(`👤 Creating Keycloak user: ${user.username}`)

  // Check if user already exists
  const existing = await getUserByUsername(adminToken, user.username)
  if (existing) {
    console.log(`   ℹ️  User already exists (id: ${existing.id})`)
    return existing.id
  }

  const response = await fetch(`${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: 'password',
          value: user.password,
          temporary: false,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create user ${user.username}: ${response.status} ${error}`)
  }

  const location = response.headers.get('location')
  const userId = location.split('/').pop()
  console.log(`   ✅ Created (id: ${userId})`)
  return userId
}

async function assignKeycloakRoles(adminToken, userId, roles) {
  console.log(`   🎭 Assigning roles: ${roles.join(', ')}`)

  // Get available roles
  const rolesResponse = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  )
  const availableRoles = await rolesResponse.json()

  // Filter to requested roles
  const rolesToAssign = availableRoles.filter((r) => roles.includes(r.name))

  if (rolesToAssign.length === 0) {
    console.log(`   ⚠️  No matching roles found`)
    return
  }

  // Assign roles to user
  const assignResponse = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(rolesToAssign),
    }
  )

  if (!assignResponse.ok) {
    const error = await assignResponse.text()
    throw new Error(`Failed to assign roles: ${assignResponse.status} ${error}`)
  }

  console.log(`   ✅ Roles assigned`)
}

async function createDatabaseUser(keycloakId, user) {
  // Get demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'demo-journal' },
  })

  if (!tenant) {
    console.log(`   ⚠️  Demo tenant not found, skipping database creation`)
    return
  }

  const primaryRole = user.roles[0] || 'AUTHOR'

  const dbUser = await prisma.user.upsert({
    where: { keycloakId },
    update: {},
    create: {
      keycloakId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: tenant.id,
      role: primaryRole,
      status: 'ACTIVE',
    },
  })

  console.log(`   ✅ Database user created (id: ${dbUser.id})`)
}

async function main() {
  try {
    console.log('🚀 Creating test users for Phase 2 testing...\n')

    // Step 1: Get admin token
    const adminToken = await getAdminToken()
    console.log('✅ Admin authenticated\n')

    // Step 2: Create each user
    for (const user of TEST_USERS) {
      const keycloakId = await createKeycloakUser(adminToken, user)
      await assignKeycloakRoles(adminToken, keycloakId, user.roles)
      await createDatabaseUser(keycloakId, user)
      console.log()
    }

    console.log('✅ All test users created successfully!\n')
    console.log('📝 Test user credentials:')
    TEST_USERS.forEach((user) => {
      console.log(`   ${user.username} / password123 (${user.roles.join(', ')})`)
    })
    console.log()
    console.log('🌐 Access at: http://localhost:3000')
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
