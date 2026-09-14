/**
 * Shasta Home Inspections — Worker
 *
 * Static pages are served by the Workers Assets binding (see wrangler.jsonc).
 * This script exists for one job: accept the contact form and email it on.
 *
 * `assets.run_worker_first` is scoped to `/api/*`, so this handler only ever
 * sees API traffic — everything else is served straight from ./public.
 */

const MAX = { name: 200, email: 254, message: 5000 } as const;

/** Mirrors the client-side check in public/assets/js/site.js. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface ContactPayload {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  /** Honeypot — must stay empty. */
  company?: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Escape for interpolation into the HTML email body. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Strip CR/LF so a submitted value can never inject extra email headers
 * (e.g. a newline followed by `Bcc:`) when used in a subject or Reply-To.
 */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function readString(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Expected JSON." }, 415);
  }

  let payload: ContactPayload;
  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return json({ error: "We couldn't read that submission." }, 400);
  }

  // Honeypot: bots fill every field they find, people never see this one.
  // Answer 200 so the bot believes it succeeded and doesn't retry.
  if (readString(payload.company, 100) !== "") {
    return json({ ok: true });
  }

  const name = readString(payload.name, MAX.name);
  const email = readString(payload.email, MAX.email);
  const message = readString(payload.message, MAX.message);

  if (!name || !email || !message) {
    return json({ error: "Please fill in your name, email and message." }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ error: "That email address doesn't look right." }, 400);
  }

  if (!env.EMAIL) {
    // Binding missing or domain not onboarded — don't pretend it worked.
    console.error("contact: EMAIL binding is not configured");
    return json(
      { error: "The contact form isn't available right now." },
      503,
    );
  }

  const safeName = oneLine(name);
  const safeEmail = oneLine(email);
  const submittedAt = new Date().toISOString();

  const text = [
    `New message from the shastainspections.com contact form.`,
    ``,
    `Name:  ${safeName}`,
    `Email: ${safeEmail}`,
    `Sent:  ${submittedAt}`,
    ``,
    `Message:`,
    message,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2428;line-height:1.6">
  <h2 style="font-size:18px;margin:0 0 16px">New contact form message</h2>
  <table cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px">
    <tr><td style="padding:2px 16px 2px 0;color:#6c757d">Name</td><td>${esc(safeName)}</td></tr>
    <tr><td style="padding:2px 16px 2px 0;color:#6c757d">Email</td><td><a href="mailto:${encodeURI(safeEmail)}">${esc(safeEmail)}</a></td></tr>
    <tr><td style="padding:2px 16px 2px 0;color:#6c757d">Sent</td><td>${esc(submittedAt)}</td></tr>
  </table>
  <div style="white-space:pre-wrap;border-left:3px solid #4a8622;padding:4px 0 4px 14px">${esc(message)}</div>
  <p style="font-size:12px;color:#6c757d;margin-top:24px">Reply directly to this email to answer ${esc(safeName)}.</p>
</body></html>`;

  try {
    await env.EMAIL.send({
      to: env.CONTACT_TO,
      from: { email: env.CONTACT_FROM, name: "Shasta Home Inspections website" },
      replyTo: safeEmail,
      subject: `Website enquiry from ${safeName}`,
      text,
      html,
    });
  } catch (err) {
    console.error("contact: send failed", err);
    return json(
      { error: "We couldn't send that just now. Please email or call us instead." },
      502,
    );
  }

  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/contact") {
      return handleContact(request, env);
    }

    // Only /api/* is routed here; anything else means a stray API path.
    return json({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;
