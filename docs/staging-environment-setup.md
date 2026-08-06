# PubFlow — Free Staging/Demo Environment (Your Machine)

**Goal:** a browser-reachable copy of PubFlow — for you to test the full editorial
workflow, for others to test without touching a terminal, and for demo links to
send potential clients — at zero hosting cost, running on your own machine.

**Read this first — the honest tradeoffs of the free/laptop-hosted approach:**
- Your machine has to be **on, awake, and connected to the internet** for the
  demo URL to work. If it sleeps, restarts, or loses network, the demo goes
  down. This is fine for scheduled test sessions and live demo calls; it's
  risky if you send someone a link and expect it to still work tomorrow.
- The free tunnel URLs are **not permanent** — they regenerate every time you
  restart the tunnels (see Step 3). You'll get a new link each session.
- This is genuinely fine for testing item 6 and for live-narrated demos. If
  you later want a link that's always up and doesn't depend on your laptop,
  see **"When you outgrow this"** at the end — there's a real zero-cost
  upgrade path (Oracle Cloud's Always Free tier), not just a paid one.

---

## Why this needs more than one tunnel

PubFlow isn't one service — the *browser* talks directly to four of them:

| Service | Why the browser needs it directly |
|---|---|
| **Web** (`:3000`) | The app itself. |
| **API** (`:3001`) | Every tRPC call the web app makes runs in the visitor's browser. |
| **Keycloak** (`:8080`) | Login redirects the browser to Keycloak's own hostname — it can't be proxied through the API. |
| **OnlyOffice** (`:8081`) | The document editor loads in an `<iframe>` pointed at this hostname directly. |

A free tunnel exposes one local port to one public URL, so this needs four
tunnels running at once (Step 3) — not four different complex setups, just
four copies of the same one-line command.

---

## Action items

### 1. Install `cloudflared` (one-time, ~2 minutes)
Cloudflare Tunnel is free, doesn't need port-forwarding on your router (works
fine behind CGNAT/most home networks), and terminates HTTPS for you.

- Windows: `winget install --id Cloudflare.cloudflared` (or download the
  `.exe` from Cloudflare's GitHub releases if you don't have winget).
- No Cloudflare account needed for what follows — "quick tunnels" (Step 3)
  work anonymously.

### 2. Start the full stack
```
pnpm docker:dev:tools     # postgres, redis, minio, keycloak, onlyoffice, pandoc/latex/scribus/preflight/image, languagetool, idml, xmlvalidate
pnpm db:migrate:dev       # first time only, or after a schema change
pnpm dev                  # api (3001), web (3000), worker
```
(`docker:dev:full` instead of `docker:dev:tools` if you also want Penpot/Meilisearch — not needed for the core workflow.)

Confirm it all works at `http://localhost:3000` before moving on — the
tunnels just re-expose what's already running, so debug locally first.

### 3. Start the four tunnels
Open four terminal windows (or four background jobs in one) and run:
```
cloudflared tunnel --url http://localhost:3000   # web
cloudflared tunnel --url http://localhost:3001   # api
cloudflared tunnel --url http://localhost:8080   # keycloak
cloudflared tunnel --url http://localhost:8081   # onlyoffice
```
Each prints a line like:
```
https://random-two-words-1234.trycloudflare.com
```
**Write down all four URLs** — you need them for the next step. They stay
stable as long as these four processes keep running; a new URL is issued
each time you restart one.

### 4. Point the app at the tunnel URLs
Create `.env.demo` (copy of `.env`, gitignored — never commit this) with
the four tunnel URLs substituted in place of `localhost`:
```
NEXT_PUBLIC_API_URL=https://<api-tunnel-url>
NEXT_PUBLIC_KEYCLOAK_URL=https://<keycloak-tunnel-url>
KEYCLOAK_URL=https://<keycloak-tunnel-url>
ONLYOFFICE_URL=https://<onlyoffice-tunnel-url>
ONLYOFFICE_CALLBACK_URL=https://<api-tunnel-url>
API_URL=https://<api-tunnel-url>
APP_URL=https://<web-tunnel-url>
```
Everything else (DB/Redis/MinIO credentials, service-to-service URLs like
`PANDOC_SERVICE_URL`) stays as `localhost` — those never leave your machine,
only the four browser-facing ones need to change.

### 5. Restart with the demo config
Stop `pnpm dev` (Ctrl+C) and restart it reading `.env.demo` instead of `.env`
— ask me when you're at this step and I'll wire up a `pnpm dev:demo` script
that does this in one command rather than you juggling env files by hand.

### 6. Share the web tunnel URL
That's the one link testers/clients need — `https://<web-tunnel-url>`. They
never see or need the other three; those just have to keep running underneath.

---

## What I can automate for you here
The four-terminal juggling in Steps 3–5 is real toil. Once you've confirmed
this approach is the one you want (versus the Oracle Cloud option below), say
so and I'll write a single script that starts all four tunnels as background
jobs, captures their URLs automatically, writes `.env.demo` for you, and
starts the app — turning Steps 3–5 into one command. I didn't build that yet
because it's easy to get wrong blind; I'd rather build it against your actual
tunnel output than guess at the format.

---

## When you outgrow this
If the laptop-must-stay-on constraint becomes a real problem — someone tries
your link while your machine is asleep, or you want a link that's stable
across restarts — **Oracle Cloud's "Always Free" tier** is worth knowing
about: unlike AWS/GCP's stingy always-free tiers, Oracle's free ARM instances
(up to 4 OCPU / 24 GB RAM, genuinely free forever, not a trial) are large
enough to run this entire stack on an always-on VM, still at zero cost. That's
a bigger one-time setup (Oracle account, VM provisioning, DNS) — worth its own
action-items pass if/when you want it. Not needed to get started today.

## Editorial setup (items 6.1–6.4) — do this once you're testing
No credentials needed, this is pure in-app configuration, on whichever
environment (local or the tunnel-exposed one) you're testing against:
1. **StyleProfile** — Dashboard → (wherever style profiles are managed) →
   create one, mark it default for at least one publication. Without this
   the copyedit bot has nothing to apply.
2. **IDML template porting** — if you have real publisher layouts, export
   from InDesign as IDML and upload via the template-porting flow.
3. **Reviewer accounts** — for any `PEER_REVIEWER` user, fill in
   `affiliation` (used by the COI exclusion filter in reviewer matching).
4. **Working practice** — AI outputs (alt-text, screening, promo posts,
   decision letters) are drafts. Review before treating as final, especially
   while testing.
