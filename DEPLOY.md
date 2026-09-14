# Deployment checklist

Work top to bottom. Steps 5 and 7 are the two that can break something live —
don't skip the verification gates before them.

---

## 0. Fix authentication

As of 2026-09-14 this machine can't talk to the Cloudflare API. `CLOUDFLARE_API_TOKEN`
is set in your shell but the API rejects it (`Invalid access token [code: 9109]`),
and it takes precedence over the stored OAuth token — which also expired
(2026-09-13T22:31Z).

Pick one:

```bash
# Option A — OAuth (simplest for deploying by hand)
unset CLOUDFLARE_API_TOKEN        # also remove it from ~/.zshrc if it lives there
npx wrangler login

# Option B — replace the API token with a valid one
export CLOUDFLARE_API_TOKEN="…"
export CLOUDFLARE_ACCOUNT_ID="…"
```

Verify before moving on:

```bash
npx wrangler whoami
```

- [ ] `whoami` prints your account without an error

Token scopes, if you go with Option B, are in [README.md](README.md#authentication--api-token-ci-or-non-interactive).

---

## 1. Put it under version control

Not a git repo yet. Worth doing before the first deploy so you can roll back.

```bash
git init
git add -A
git commit -m "Static rebuild of shastainspections.com on Cloudflare Workers"
```

- [ ] committed (`.gitignore` already excludes `node_modules/`, `.wrangler/`, `.dev.vars`)

---

## 2. Onboard the domain to Email Sending

The contact form returns 503 until this is done.

**⚠️ Do not blindly accept the DNS records it offers.** The domain already has
one SPF record and live mail routing:

```
MX  → route1/2/3.mx.cloudflare.net          (delivers riley@shastainspections.com)
TXT → v=spf1 a mx include:_spf.elasticemail.com include:_spf.mx.cloudflare.net ~all
```

A domain may have only **one** SPF TXT record. If onboarding wants to add a
second, merge its `include:` into the existing record instead. DKIM records are
CNAMEs on their own hostnames and are safe to add as-is.

```bash
npx wrangler email sending enable shastainspections.com
npx wrangler email sending dns get shastainspections.com
```

Then confirm exactly one SPF record still resolves:

```bash
dig +short shastainspections.com TXT | grep spf
```

- [ ] domain onboarded
- [ ] DKIM records added
- [ ] `dig` returns exactly **one** SPF line, still containing `_spf.elasticemail.com`
      and `_spf.mx.cloudflare.net`

---

## 3. Deploy to workers.dev first

Do **not** attach the custom domain yet. Comment out the `routes` block in
`wrangler.jsonc` and make sure workers.dev is on:

```jsonc
// "routes": [
//   { "pattern": "shastainspections.com", "custom_domain": true },
//   { "pattern": "www.shastainspections.com", "custom_domain": true }
// ],
"workers_dev": true
```

```bash
npm install
npm run deploy
```

- [ ] deploy succeeded, note the `https://shastainspections.<subdomain>.workers.dev` URL

---

## 4. Verify on workers.dev

Replace `$URL` with your workers.dev URL.

```bash
URL=https://shastainspections.<subdomain>.workers.dev

# every page + the 404
for p in / /bio /areas-service /pricing /sample-reports /contact /nope; do
  printf '%-18s %s\n' "$p" "$(curl -sS -o /dev/null -w '%{http_code}' $URL$p)"
done

# legacy redirects
for p in /home-page /node/3 /media/8/download; do
  printf '%-20s %s -> %s\n' "$p" \
    "$(curl -sS -o /dev/null -w '%{http_code}' $URL$p)" \
    "$(curl -sS -o /dev/null -w '%{redirect_url}' $URL$p)"
done

# the PDFs that were 403 on the old site
curl -sS -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' \
  $URL/assets/reports/13579-phaedra-lane-inspection.pdf
```

Expect 200 for the six pages, 404 for `/nope`, 301s on the redirects, and
`200 application/pdf 1438638` for the PDF.

In a browser:

- [ ] Areas of Service map renders with the three counties outlined
- [ ] pages look right on a phone-width window
- [ ] no console errors

---

## 5. Send a real contact form submission

This is the gate for step 2 having worked.

- [ ] submitted the form on `$URL/contact`
- [ ] the email actually arrived at riley@shastainspections.com
- [ ] hitting Reply addresses the sender, not `website@`

If it fails, check `npx wrangler tail` — the Worker logs the reason.

---

## 6. Warn Riley

The next step swaps the live site. Give him a heads-up and pick a quiet window.

- [ ] Riley knows the site is changing over

---

## 7. Cut the domain over

`shastainspections.com` and `www` are proxied A records pointing at the Drupal
origin. Attaching the Custom Domain replaces them — **this takes the old site
down.**

Restore the `routes` block in `wrangler.jsonc`, then:

```bash
npm run deploy
```

If Wrangler refuses because a record already exists at that hostname, delete the
existing A records for `shastainspections.com` and `www` in the Cloudflare DNS
tab and deploy again. Certificates are issued automatically and can take a few
minutes.

- [ ] `routes` restored and deployed
- [ ] both hostnames attached (Workers & Pages → the Worker → Settings → Domains & Routes)

---

## 8. Verify live

```bash
for h in shastainspections.com www.shastainspections.com; do
  echo "--- $h"
  curl -sSI https://$h/ | head -1
  curl -sS -o /dev/null -w '  /pricing %{http_code}\n' https://$h/pricing
done

curl -sS -o /dev/null -w 'old home-page URL: %{http_code} -> %{redirect_url}\n' \
  https://shastainspections.com/home-page
```

- [ ] both hostnames serve the new site over HTTPS
- [ ] one more contact form submission from the real domain arrives
- [ ] sample report PDFs download

---

## 9. Afterwards

- [ ] resubmit the sitemap: `https://shastainspections.com/sitemap.xml` in Google Search Console
- [ ] leave the Drupal origin running for a week in case you need to revert
- [ ] then decommission Drupal and stop paying for whatever hosts it

### Rolling back

Nothing is destroyed until step 9. To revert: remove the Custom Domains from the
Worker and point the A records back at the Drupal origin.
