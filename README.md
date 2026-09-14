# Shasta Home Inspections

Static rebuild of shastainspections.com (previously Drupal 10) as flat HTML files
served by Cloudflare Workers Static Assets, plus one small Worker route that
handles the contact form.

```
public/                     everything served to visitors
  index.html                /
  bio.html                  /bio
  areas-service.html        /areas-service
  pricing.html              /pricing
  sample-reports.html       /sample-reports
  contact.html              /contact
  404.html                  served for unknown paths
  _headers                  security headers + cache policy
  _redirects                legacy Drupal URLs -> new URLs
  robots.txt, sitemap.xml
  assets/
    css/site.css            the whole stylesheet
    js/site.js              nav, scroll reveal, contact form
    js/map.js               Areas of Service map
    fonts/                  DM Serif Display + Roboto (latin subsets, self-hosted)
    img/                    original photos, resized to webp + fallback
    reports/                the three sample inspection PDFs
    data/counties.json      Shasta/Tehama/Trinity outlines for the map
    vendor/maplibre-gl.*    MapLibre GL 5.9.0, vendored
src/index.ts                Worker: POST /api/contact -> email
wrangler.jsonc              Worker + assets + email binding config
```

The pages are plain HTML — edit them directly, no build step. There is no
templating, so the header and footer are repeated in each file; if you change
one, change it in all seven.

---

## Local development

```bash
npm install
npm run dev
```

Serves on <http://localhost:8787>. Contact form submissions are not really sent
locally — Wrangler writes the rendered email to `.wrangler/tmp/email/` and logs
the path. To send real email in dev, add `"remote": true` to the `send_email`
binding in `wrangler.jsonc` (and take it out again before committing).

> `_headers` and `_redirects` are only read when the dev server starts.
> Restart after editing them.
>
> `assets/css` and `assets/js` are served with a 1-hour cache. While iterating,
> hard-reload (⌘⇧R) or the browser will keep serving the old stylesheet.

---

## Deploying

```bash
npm run deploy
```

For a first deploy or a domain cutover, follow the ordered checklist in
[DEPLOY.md](DEPLOY.md) instead — the order matters.

### Authentication — the easy way

For deploying by hand from your own machine, you do **not** need an API token:

```bash
npx wrangler login
```

That runs an OAuth flow in the browser and stores the credentials locally. This
is the recommended option unless you are wiring up CI.

### Authentication — API token (CI, or non-interactive)

Create the token at **My Profile → API Tokens → Create Token** in the Cloudflare
dashboard. Start from the **Edit Cloudflare Workers** template, then add DNS:

| Scope | Permission | Why |
|---|---|---|
| Account | **Workers Scripts: Edit** | upload the Worker and the static assets |
| Account | **Account Settings: Read** | resolve the account ID |
| Zone | **Workers Routes: Edit** | bind `shastainspections.com` to the Worker |
| Zone | **Zone: Read** | resolve the zone for `shastainspections.com` |

Restrict **Account Resources** to your account and **Zone Resources** to
`shastainspections.com`.

Attaching a Custom Domain creates the DNS record server-side through the Workers
API, so a separate DNS permission is usually not required — Wrangler's own OAuth
scope set covers custom domains with `workers_routes:write` and `zone:read` and
no DNS scope at all. If a deploy fails specifically on the domain attach, add
**Zone → DNS → Edit** and retry.

If you would rather attach the domain by hand in the dashboard
(Workers & Pages → the Worker → Settings → Domains & Routes), delete the
`routes` block from `wrangler.jsonc` entirely.

**Where to put it.** Wrangler reads two environment variables:

```bash
export CLOUDFLARE_API_TOKEN="…"
export CLOUDFLARE_ACCOUNT_ID="…"
```

- **Shell:** export them in your session, or put them in `.dev.vars` — already
  gitignored. Never commit the token.
- **GitHub Actions:** add both as repository secrets
  (Settings → Secrets and variables → Actions), then reference them as
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.

---

## Contact form email — required setup

The form posts to `/api/contact`, which sends through the Cloudflare Email
Sending binding. **Until the domain is onboarded to Email Sending the form will
fail** (the Worker returns a clear error and the page tells the visitor to call
or email instead — it does not silently swallow the message).

```bash
npx wrangler email sending enable shastainspections.com
npx wrangler email sending dns get shastainspections.com
```

Or: **Compute & AI → Email Service → Email Sending → Onboard Domain**.

### ⚠️ Read this before onboarding — the SPF record

This domain already sends and receives mail:

- **MX** points at Cloudflare Email Routing (`route1/2/3.mx.cloudflare.net`),
  which is what delivers `riley@shastainspections.com` today.
- **SPF** already exists:
  `v=spf1 a mx include:_spf.elasticemail.com include:_spf.mx.cloudflare.net ~all`

A domain may only have **one** SPF TXT record. If onboarding adds a second one,
SPF breaks for *all* mail from this domain, including Riley's. If Email Sending
asks to add an SPF record, **merge its include into the existing record instead
of creating a new one** — the result should be a single TXT record that keeps
`_spf.elasticemail.com` and `_spf.mx.cloudflare.net` and adds whatever include
Cloudflare asks for.

The DKIM records it adds are CNAMEs on their own hostnames and are safe to add
as-is. Existing DMARC is `v=DMARC1; p=none;` — no change needed.

After onboarding, confirm delivery with a real submission before cutting DNS
over. Sender/recipient are set in `wrangler.jsonc` under `vars`:

```jsonc
"CONTACT_TO":   "riley@shastainspections.com",
"CONTACT_FROM": "website@shastainspections.com"
```

`CONTACT_FROM` must be on the onboarded domain. `Reply-To` is set to whatever
the visitor typed, so replying in the mail client answers them directly.

---

## DNS cutover

`shastainspections.com` and `www` currently resolve to proxied Cloudflare A
records pointing at the Drupal origin. A Workers Custom Domain replaces those
records, so this is the step that actually takes the old site down. Suggested
order:

1. `npm run deploy` — **with the `routes` block commented out**. The Worker goes
   live on `shastainspections.<your-subdomain>.workers.dev`.
2. Check every page there, and send a real contact form submission.
3. Restore the `routes` block and deploy again, or add the custom domains in the
   dashboard. Cloudflare will replace the existing A records and issue certs.
4. Confirm `https://shastainspections.com` and `https://www.shastainspections.com`.

Keep the Drupal origin running until step 4 passes, in case you need to revert
by pointing the A records back.

---

## Notes on the rebuild

Content is carried over verbatim from the Drupal site. Two things worth a look:

- The homepage says *"over 7200 inspections … past 12 years"*; the bio page says
  *"over 7000 inspections … past 11 years"*. Both are as they were on the old
  site — you may want to reconcile them.
- The bio opens *"After receiving my business administration degree in 2011 from
  CSU Chico, immediately took on…"* — missing an "I". Left as written.

Three defects on the old site were fixed here:

- The three sample report PDFs returned **403** to anonymous visitors. The files
  are now served directly from `/assets/reports/`, and `_redirects` sends the old
  `/media/N/download` URLs to them.
- Headings asked for `"DM Serif"` while the font-face declared
  `"DM Serif Display"`, so they silently fell back to a generic serif. The font
  is now self-hosted and actually loads.
- Drupal's theme debug output was enabled in production, shipping template paths
  to every visitor.

The logo in the old theme was FivePaths' own agency mark (`五` in a brush
circle), shipped as the theme default and never replaced. It is not used here —
the header is a wordmark, and `assets/img/mark.svg` is a plain house glyph used
for the favicon. Drop in a real logo when there is one.

The Areas of Service map uses the same MapLibre setup and the same
`styles.gtfs.media` basemap as before. The county outlines were simplified from
1,042 KB to 19 KB with no visible difference at the zoom levels used. MapLibre
is vendored rather than loaded from a CDN, and the map degrades to a text
fallback if it fails to load.
