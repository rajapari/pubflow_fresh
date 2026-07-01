import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isoDate(d: Date) { return d.toISOString().split('T')[0] }

function oaiError(code: string, message: string, verb: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">
  <responseDate>${new Date().toISOString()}</responseDate>
  <request verb="${esc(verb)}">${esc(baseUrl)}</request>
  <error code="${esc(code)}">${esc(message)}</error>
</OAI-PMH>`
}

export async function oaiRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    reply.header('Content-Type', 'application/xml; charset=utf-8')

    const q       = req.query as Record<string, string>
    const verb    = q['verb'] ?? ''
    const baseUrl = `${process.env.API_URL ?? 'http://localhost:3001'}/oai`

    if (!verb) {
      reply.send(oaiError('badVerb', 'Verb argument is missing', '', baseUrl))
      return
    }

    const tenantSlug = q['set']
    const tenant = tenantSlug
      ? await prisma.tenant.findUnique({ where: { slug: tenantSlug } })
      : null

    switch (verb) {
      case 'Identify': {
        reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>${new Date().toISOString()}</responseDate>
  <request verb="Identify">${esc(baseUrl)}</request>
  <Identify>
    <repositoryName>PubFlow Repository</repositoryName>
    <baseURL>${esc(baseUrl)}</baseURL>
    <protocolVersion>2.0</protocolVersion>
    <adminEmail>${esc(process.env.SMTP_FROM ?? 'admin@pubflow.local')}</adminEmail>
    <earliestDatestamp>2024-01-01</earliestDatestamp>
    <deletedRecord>no</deletedRecord>
    <granularity>YYYY-MM-DD</granularity>
  </Identify>
</OAI-PMH>`)
        break
      }

      case 'ListMetadataFormats': {
        reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>${new Date().toISOString()}</responseDate>
  <request verb="ListMetadataFormats">${esc(baseUrl)}</request>
  <ListMetadataFormats>
    <metadataFormat>
      <metadataPrefix>oai_dc</metadataPrefix>
      <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>
      <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>
    </metadataFormat>
  </ListMetadataFormats>
</OAI-PMH>`)
        break
      }

      case 'ListSets': {
        const tenants = await prisma.tenant.findMany({ select: { slug: true, name: true }, take: 100 })
        const sets = tenants.map(t =>
          `<set><setSpec>${esc(t.slug)}</setSpec><setName>${esc(t.name)}</setName></set>`
        ).join('\n    ')
        reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>${new Date().toISOString()}</responseDate>
  <request verb="ListSets">${esc(baseUrl)}</request>
  <ListSets>
    ${sets}
  </ListSets>
</OAI-PMH>`)
        break
      }

      case 'ListIdentifiers':
      case 'ListRecords': {
        const prefix = q['metadataPrefix']
        if (prefix !== 'oai_dc') {
          reply.send(oaiError('cannotDisseminateFormat', 'Only oai_dc is supported', verb, baseUrl))
          return
        }

        const where: Record<string, unknown> = { status: 'PUBLISHED' }
        if (tenant) where['tenantId'] = tenant.id

        const articles = await prisma.submission.findMany({
          where,
          include: {
            author:  { select: { firstName: true, lastName: true } },
            publication: { select: { title: true, issn: true } },
            issue:   { select: { publishedAt: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        })

        if (!articles.length) {
          reply.send(oaiError('noRecordsMatch', 'No matching records', verb, baseUrl))
          return
        }

        const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
        const records = articles.map(a => {
          const pubDate = a.issue?.publishedAt ?? a.updatedAt
          const identifier = a.doi ? `oai:pubflow:${a.doi}` : `oai:pubflow:${a.id}`
          const dcRecord = `<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
              xmlns:dc="http://purl.org/dc/elements/1.1/"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">
            <dc:title>${esc(a.title)}</dc:title>
            <dc:creator>${esc(`${a.author.firstName ?? ''} ${a.author.lastName ?? ''}`.trim())}</dc:creator>
            ${a.abstract ? `<dc:description>${esc(a.abstract)}</dc:description>` : ''}
            <dc:source>${esc(a.publication.title)}</dc:source>
            ${a.publication.issn ? `<dc:identifier>ISSN:${esc(a.publication.issn)}</dc:identifier>` : ''}
            ${a.doi ? `<dc:identifier>${esc(a.doi)}</dc:identifier>` : ''}
            <dc:identifier>${esc(`${appUrl}/articles/${a.id}`)}</dc:identifier>
            <dc:date>${isoDate(pubDate)}</dc:date>
            <dc:type>article</dc:type>
            <dc:language>en</dc:language>
            ${(a.keywords as string[]).map(k => `<dc:subject>${esc(k)}</dc:subject>`).join('\n            ')}
          </oai_dc:dc>`

          if (verb === 'ListIdentifiers') {
            return `<header><identifier>${esc(identifier)}</identifier><datestamp>${isoDate(pubDate)}</datestamp></header>`
          }
          return `<record>
            <header><identifier>${esc(identifier)}</identifier><datestamp>${isoDate(pubDate)}</datestamp></header>
            <metadata>${dcRecord}</metadata>
          </record>`
        }).join('\n')

        const outerTag = verb === 'ListIdentifiers' ? 'ListIdentifiers' : 'ListRecords'
        reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>${new Date().toISOString()}</responseDate>
  <request verb="${verb}">${esc(baseUrl)}</request>
  <${outerTag}>
    ${records}
  </${outerTag}>
</OAI-PMH>`)
        break
      }

      case 'GetRecord': {
        const identifier = q['identifier']
        const prefix     = q['metadataPrefix']
        if (prefix !== 'oai_dc') {
          reply.send(oaiError('cannotDisseminateFormat', 'Only oai_dc is supported', verb, baseUrl))
          return
        }

        // identifier format: oai:pubflow:10.xxx/yyy  or  oai:pubflow:{uuid}
        const id = identifier?.replace(/^oai:pubflow:/, '') ?? ''
        const article = await prisma.submission.findFirst({
          where: {
            status: 'PUBLISHED',
            OR: [{ doi: id }, { id }],
          },
          include: {
            author:      { select: { firstName: true, lastName: true } },
            publication: { select: { title: true, issn: true } },
            issue:       { select: { publishedAt: true } },
          },
        })
        if (!article) {
          reply.send(oaiError('idDoesNotExist', 'No record matches identifier', verb, baseUrl))
          return
        }

        const pubDate  = article.issue?.publishedAt ?? article.updatedAt
        const appUrl   = process.env.APP_URL ?? 'http://localhost:3000'
        const ident    = article.doi ? `oai:pubflow:${article.doi}` : `oai:pubflow:${article.id}`
        reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>${new Date().toISOString()}</responseDate>
  <request verb="GetRecord">${esc(baseUrl)}</request>
  <GetRecord>
    <record>
      <header><identifier>${esc(ident)}</identifier><datestamp>${isoDate(pubDate)}</datestamp></header>
      <metadata>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
            xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>${esc(article.title)}</dc:title>
          <dc:creator>${esc(`${article.author.firstName ?? ''} ${article.author.lastName ?? ''}`.trim())}</dc:creator>
          ${article.abstract ? `<dc:description>${esc(article.abstract)}</dc:description>` : ''}
          <dc:source>${esc(article.publication.title)}</dc:source>
          ${article.doi ? `<dc:identifier>${esc(article.doi)}</dc:identifier>` : ''}
          <dc:identifier>${esc(`${appUrl}/articles/${article.id}`)}</dc:identifier>
          <dc:date>${isoDate(pubDate)}</dc:date>
          <dc:type>article</dc:type>
        </oai_dc:dc>
      </metadata>
    </record>
  </GetRecord>
</OAI-PMH>`)
        break
      }

      default:
        reply.send(oaiError('badVerb', `Unknown verb: ${verb}`, verb, baseUrl))
    }
  })
}
