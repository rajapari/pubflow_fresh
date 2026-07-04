import { MarketingPage } from '@/components/MarketingPage'

export default function ApiPage() {
  return (
    <MarketingPage
      title="API & Integrations"
      subtitle="PubFlow is API-first: everything the dashboard does goes through the same typed API you can call yourself."
      sections={[
        {
          title: 'Typed tRPC API',
          content:
            'The platform exposes a tRPC v11 API covering submissions, manuscripts, publications, reviews, editorial decisions, users, and analytics. Every procedure is end-to-end typed — if you build in TypeScript, you get compile-time safety against the exact router the server runs. Queries support HTTP batching out of the box, so a dashboard screen that needs five resources costs one round trip.',
        },
        {
          title: 'Authentication',
          content:
            'All API access authenticates with OpenID Connect bearer tokens issued by the built-in Keycloak identity provider. Server-to-server integrations use the standard token endpoint; browser clients get silent token refresh. Every request is scoped to the caller’s tenant and role — the API enforces the same permissions the UI does.',
        },
        {
          title: 'Open Protocols for Discovery',
          content:
            'Published content is available over standards that repositories and aggregators already speak: an OAI-PMH endpoint (/oai) for metadata harvesting in Dublin Core, RSS feeds (/rss) per publication for readers and alerting services, and public JSON article metadata backing your portal pages.',
        },
        {
          title: 'File Handling',
          content:
            'Manuscript uploads go directly to S3-compatible object storage via presigned URLs — files never pass through the application server, which keeps large LaTeX bundles and artwork fast. Downloads work the same way, with short-lived signed links scoped to a single object.',
        },
        {
          title: 'Outbound Integrations',
          content:
            'PubFlow pushes to the services publishers already rely on: Crossref for DOI registration, PubMed via FTP for JATS package delivery, Lulu for print-on-demand fulfilment, and your own portal for public HTML. Background jobs run on a Redis-backed queue with automatic retries, so a temporarily unreachable endpoint never blocks your editorial workflow.',
        },
        {
          title: 'Webhooks & Events (Roadmap)',
          content:
            'Outbound webhooks for submission status changes, review completion, and publication events are on the near-term roadmap — see the Roadmap page. Until then, workflow state can be polled through the submissions API, which includes the full transition history for every manuscript.',
        },
      ]}
      ctaLabel="Talk to us about an integration"
      ctaHref="/contact"
    />
  )
}
