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
Two files needed — **not just one** (Next.js doesn't read the root `.env` at
all; it only auto-loads its own `.env.local`, so the browser-facing
`NEXT_PUBLIC_*` vars have to live in a separate file from the server-side
ones, confirmed by actually running this):

**`.env.demo`** (repo root, copy of `.env`, gitignored) — only the
server-side vars that need to leave the machine change; things Keycloak/
OnlyOffice reach purely container-to-container (`KEYCLOAK_URL`,
`ONLYOFFICE_CALLBACK_URL` — that one stays `http://host.docker.internal:3001`,
it's OnlyOffice's Docker container calling back to your host, nothing to do
with the tunnels) are untouched:
```
API_URL=https://<api-tunnel-url>
APP_URL=https://<web-tunnel-url>
ONLYOFFICE_URL=https://<onlyoffice-tunnel-url>
```

**`apps/web/.env.local`** (gitignored, new file) — the browser-facing vars:
```
NEXT_PUBLIC_API_URL=https://<api-tunnel-url>
NEXT_PUBLIC_KEYCLOAK_URL=https://<keycloak-tunnel-url>
NEXT_PUBLIC_KEYCLOAK_REALM=pubflow
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=pubflow-web
```

### 5. Allow the tunnel URL in Keycloak (easy to miss — breaks login silently otherwise)
Keycloak's `pubflow-web` client ships with `redirectUris`/`webOrigins` locked
to `localhost` (`services/keycloak/realm-export.json`). That file only takes
effect on Keycloak's *first* import — editing it does nothing once the
container's already run once (which it has, for local dev). Update the
already-running instance via the Admin API instead:
```
# 1. Get an admin token (uses KEYCLOAK_ADMIN_PASSWORD from .env)
# 2. GET the pubflow-web client, add the web tunnel URL to redirectUris (+ "/*")
#    and webOrigins (bare origin, no path)
# 3. PUT it back
```
Ask me to do this step — it's a few curl calls against `localhost:8080/admin/...`,
safe to run each time you get a new web tunnel URL, and I'd rather run it
directly than have you copy-paste admin API calls by hand.

### 6. Restart with the demo config
```
pnpm dev:demo
```
Already wired up (`dev:demo` scripts in `apps/api`, `apps/worker`,
`apps/web`, and the root `turbo.json`) — reads `.env.demo` for api/worker,
and Next.js auto-loads `apps/web/.env.local`. Stop any plain `pnpm dev`
first (same ports).

### 7. Share the web tunnel URL
That's the one link testers/clients need — `https://<web-tunnel-url>`. They
never see or need the other three; those just have to keep running underneath.

---

## Verifying it's actually working (not just "the process didn't crash")
A tunnel returning *a* response doesn't mean the whole chain works — check:
- `curl https://<web-tunnel-url>` → `200`
- `curl https://<api-tunnel-url>/health` → `200`
- `curl https://<keycloak-tunnel-url>/realms/pubflow` → `200`
- `curl https://<onlyoffice-tunnel-url>/healthcheck` → `200`
- CORS: `curl -X OPTIONS -H "Origin: https://<web-tunnel-url>" -H "Access-Control-Request-Method: POST" https://<api-tunnel-url>/trpc/submission.list` → look for
  `Access-Control-Allow-Origin: https://<web-tunnel-url>` in the response
  headers. This is set from `APP_URL` (`apps/api/src/server.ts`) — if it's
  missing, `.env.demo`'s `APP_URL` doesn't match the actual web tunnel URL.
- Actually log in through the web URL once, in a real browser — Step 5 (Keycloak)
  is the one failure mode none of the above curl checks catch.

## What I can automate further
Steps 3–6 involve real toil (four tunnels, two env files, a live Keycloak
API update) every time you restart. I did this manually once, end-to-end,
to make sure the real process actually works before automating it blind.
Next: a single script that starts all four tunnels, extracts their URLs,
writes both env files, updates Keycloak, and starts `pnpm dev:demo` — turning
this into one command. Ask and I'll build it.

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
