// Print-on-demand via Lulu v2 API.
// Lulu credentials are stored per-tenant in TenantSettings (luluClientKey, luluClientSecret, luluPodPackageId)
// or overridden with LULU_CLIENT_KEY / LULU_CLIENT_SECRET / LULU_POD_PACKAGE_ID env vars.

export interface LuluCredentials {
  clientKey:    string
  clientSecret: string
  podPackageId: string
}

const LULU_TOKEN_URL = 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token'
const LULU_JOBS_URL  = 'https://api.lulu.com/print-jobs/'

async function getLuluToken(creds: LuluCredentials): Promise<string> {
  const res = await fetch(LULU_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     creds.clientKey,
      client_secret: creds.clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`Lulu auth failed: HTTP ${res.status}`)
  const json = await res.json() as { access_token: string }
  return json.access_token
}

export async function submitToLulu(options: {
  title:        string
  interiorUrl:  string
  coverUrl?:    string
  contactEmail: string
  externalId:   string
  creds:        LuluCredentials
  shippingAddress?: {
    name: string; street1: string; city: string
    country_code: string; postcode: string; phone_number: string
  }
}): Promise<{ id: number | string; status: string }> {
  const token = await getLuluToken(options.creds)

  const address = options.shippingAddress ?? {
    name:         'PubFlow Distribution',
    street1:      '123 Publisher Ave',
    city:         'San Francisco',
    country_code: 'US',
    postcode:     '94105',
    phone_number: '4155550000',
  }

  const body = {
    contact_email:         options.contactEmail,
    external_id:           options.externalId,
    production_delay:      120,
    shipping_option_level: 'MAIL',
    shipping_address:      address,
    line_items: [{
      title:          options.title,
      interior:       options.interiorUrl,
      ...(options.coverUrl ? { cover: options.coverUrl } : {}),
      pod_package_id: options.creds.podPackageId,
      quantity:       1,
    }],
  }

  const res = await fetch(LULU_JOBS_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Lulu print job failed: HTTP ${res.status} — ${text.slice(0, 300)}`)
  }

  return res.json() as Promise<{ id: number | string; status: string }>
}
