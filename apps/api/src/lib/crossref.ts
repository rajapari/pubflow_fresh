import { randomUUID } from 'crypto'

export interface CrossRefArticle {
  doi:       string
  title:     string
  firstName: string
  lastName:  string
  orcid?:    string | null
  coAuthors: Array<{ name: string; orcid?: string | null }>
  resourceUrl: string
  pubDate:   Date
}

export interface CrossRefIssue {
  doiPrefix:     string
  journalTitle:  string
  issn?:         string | null
  volume?:       number | null
  number?:       number | null
  year:          number
  articles:      CrossRefArticle[]
}

export interface CrossRefCredentials {
  loginId:       string
  loginPassword: string
  depositorName: string
  depositorEmail: string
  testMode:      boolean
}

// Escape characters not valid in XML text
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function pad2(n: number) { return String(n).padStart(2, '0') }

function formatTimestamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
         `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

function personName(first: string, last: string, orcid: string | null | undefined, sequence: 'first' | 'additional'): string {
  const orcidEl = orcid
    ? `      <ORCID>https://orcid.org/${esc(orcid)}</ORCID>\n`
    : ''
  return `    <person_name sequence="${sequence}" contributor_role="author">
      <given_name>${esc(first.trim())}</given_name>
      <surname>${esc(last.trim())}</surname>
${orcidEl}    </person_name>`
}

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return ['', parts[0]]
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]]
}

function buildDepositXml(issue: CrossRefIssue, now: Date): string {
  const batchId = `pubflow-${randomUUID()}`
  const ts      = formatTimestamp(now)
  const year    = String(issue.year)
  const month   = pad2(now.getMonth() + 1)
  const day     = pad2(now.getDate())

  const issnEl   = issue.issn ? `  <issn media_type="electronic">${esc(issue.issn)}</issn>\n` : ''
  const volumeEl = issue.volume ? `    <journal_volume><volume>${issue.volume}</volume></journal_volume>\n` : ''
  const issueEl  = issue.number ? `    <issue>${issue.number}</issue>\n` : ''

  const articleEls = issue.articles.map(art => {
    const pubD = art.pubDate
    const contributors = [
      personName(art.firstName, art.lastName, art.orcid, 'first'),
      ...art.coAuthors.map(co => {
        const [givenName, surname] = splitName(co.name)
        return personName(givenName, surname, co.orcid, 'additional')
      }),
    ].join('\n')

    return `  <journal_article publication_type="full_text" reference_distribution_opts="any">
    <titles>
      <title>${esc(art.title)}</title>
    </titles>
    <contributors>
${contributors}
    </contributors>
    <publication_date media_type="online">
      <year>${pubD.getFullYear()}</year>
      <month>${pad2(pubD.getMonth() + 1)}</month>
      <day>${pad2(pubD.getDate())}</day>
    </publication_date>
    <doi_data>
      <doi>${esc(art.doi)}</doi>
      <resource>${esc(art.resourceUrl)}</resource>
    </doi_data>
  </journal_article>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<doi_batch version="5.4.0"
  xmlns="http://www.crossref.org/schema/5.4.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.crossref.org/schema/5.4.0 https://www.crossref.org/schemas/crossref5.4.0.xsd">
  <head>
    <doi_batch_id>${esc(batchId)}</doi_batch_id>
    <timestamp>${ts}</timestamp>
    <depositor>
      <depositor_name>${esc(issue.journalTitle)}</depositor_name>
      <email_address>${esc('noreply@pubflow.local')}</email_address>
    </depositor>
    <registrant>${esc(issue.doiPrefix)}</registrant>
  </head>
  <body>
    <journal>
      <journal_metadata language="en">
        <full_title>${esc(issue.journalTitle)}</full_title>
${issnEl}      </journal_metadata>
      <journal_issue>
        <publication_date media_type="online">
          <year>${year}</year>
          <month>${month}</month>
          <day>${day}</day>
        </publication_date>
${volumeEl}${issueEl}      </journal_issue>
${articleEls}
    </journal>
  </body>
</doi_batch>`
}

export async function depositToCrossRef(
  issue: CrossRefIssue,
  creds: CrossRefCredentials,
): Promise<{ queued: boolean; batchId: string; rawResponse: string }> {
  const now       = new Date()
  const xml       = buildDepositXml(issue, now)
  const batchId   = `pubflow-batch-${now.getTime()}`

  const endpoint  = creds.testMode
    ? 'https://test.crossref.org/servlet/deposit'
    : 'https://doi.crossref.org/servlet/deposit'

  const form = new FormData()
  form.append('operation',    'doMDUpload')
  form.append('login_id',     creds.loginId)
  form.append('login_passwd', creds.loginPassword)
  form.append('fname', new Blob([xml], { type: 'application/xml' }), 'deposit.xml')

  const res         = await fetch(endpoint, { method: 'POST', body: form })
  const rawResponse = await res.text()

  const queued = res.ok && (
    rawResponse.includes('successfully') ||
    rawResponse.includes('queued') ||
    rawResponse.includes('received')
  )

  return { queued, batchId, rawResponse }
}
