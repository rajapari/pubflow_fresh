import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function rssRoutes(app: FastifyInstance) {
  // GET /rss/:tenantSlug — all publications
  // GET /rss/:tenantSlug/:publicationId — specific journal
  app.get('/:tenantSlug', { schema: { params: { type:'object', properties:{ tenantSlug:{type:'string'} } } } }, handler)
  app.get('/:tenantSlug/:publicationId', { schema: { params: { type:'object', properties:{ tenantSlug:{type:'string'}, publicationId:{type:'string'} } } } }, handler)

  async function handler(req: any, reply: any) {
    const { tenantSlug, publicationId } = req.params

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } })
    if (!tenant) { reply.status(404).send('Not found'); return }

    const where: Record<string, unknown> = { tenantId: tenant.id, status: 'PUBLISHED' }
    if (publicationId) where['publicationId'] = publicationId

    let feedTitle = `${tenant.name} — Published Articles`
    if (publicationId) {
      const pub = await prisma.publication.findFirst({ where: { id: publicationId, tenantId: tenant.id } })
      if (pub) feedTitle = pub.title
    }

    const articles = await prisma.submission.findMany({
      where,
      include: {
        author:      { select: { firstName: true, lastName: true } },
        publication: { select: { title: true } },
        issue:       { select: { publishedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
    const feedUrl = publicationId
      ? `${process.env.API_URL ?? 'http://localhost:3001'}/rss/${tenantSlug}/${publicationId}`
      : `${process.env.API_URL ?? 'http://localhost:3001'}/rss/${tenantSlug}`

    const items = articles.map(a => {
      const pubDate = (a.issue?.publishedAt ?? a.updatedAt).toUTCString()
      const link    = a.doi ? `https://doi.org/${a.doi}` : `${appUrl}/${tenantSlug}/articles/${encodeURIComponent(a.doi ?? a.id)}`
      return `
  <item>
    <title>${esc(a.title)}</title>
    <link>${esc(link)}</link>
    <guid isPermaLink="${a.doi ? 'true' : 'false'}">${esc(a.doi ?? a.id)}</guid>
    <pubDate>${esc(pubDate)}</pubDate>
    <author>${esc(`${a.author.firstName ?? ''} ${a.author.lastName ?? ''}`.trim())}</author>
    ${a.abstract ? `<description>${esc(a.abstract.slice(0, 500))}</description>` : ''}
    <source url="${esc(feedUrl)}">${esc(feedTitle)}</source>
  </item>`
    }).join('')

    const lastBuildDate = articles[0]
      ? (articles[0].issue?.publishedAt ?? articles[0].updatedAt).toUTCString()
      : new Date().toUTCString()

    reply.header('Content-Type', 'application/rss+xml; charset=utf-8')
    reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(feedTitle)}</title>
    <link>${esc(`${appUrl}/${tenantSlug}`)}</link>
    <description>Latest published articles from ${esc(feedTitle)}</description>
    <language>en</language>
    <lastBuildDate>${esc(lastBuildDate)}</lastBuildDate>
    <atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`)
  }
}
