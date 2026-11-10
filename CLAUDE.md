# Bread Co. — handoff notes

A one-page weekly order site for a home bakery (Taiwanese-style breads, baked to order, delivered Wednesday mornings). It is live and customers have already used it. Repo: https://github.com/o1ie12/bread-co, branch `main`. Live at https://bread-co.netlify.app. Netlify redeploys on every push to `main`.

## How the owner likes to work
- Commit and push straight to `main` when a change is done. Don't ask first. Never force-push.
- Prices are NT$. Customers are mostly Chinese speakers, so UI text is bilingual (中文 · English).
- Wants it simple and premium, and hates anything that looks "AI generated". Design rules are in the next section.
- Preview a visual change in the browser before pushing, then verify it.

## Stack
- Static site, no build step: `index.html`, `styles.css`, `script.js` (ES module).
- Vendored libs only: Lenis smooth scroll in `vendor/lenis/`. The preview browser can't load CDNs.
- Netlify Functions v2 (`netlify/functions/*.mjs`), esbuild bundler. Deps: `@netlify/blobs` (^10.7.13, don't bump past 10; v11 needs Node 22.12+) and `nodemailer`.
- Admin page at `/admin/` (`admin/index.html`, `admin.js`, `admin.css`), password protected, not indexed.

## Design language (keep it consistent)
- Palette: cream `#f4eee3`, cream-2 `#ebe2d0`, ink `#2b1b12`, crust `#a9581f`, honey `#d9a35f`.
- Type: Bodoni Moda for headings, Jost for small labels, Noto Serif TC for Chinese.
- Arch-shaped photo windows, paper-grain overlay, asymmetric editorial layout, big wordmark, live countdown.
- Avoid: centered hero formula, three identical bordered cards, default fonts, generic copy.

## Page behaviour
- The page is only the order form (three bread cards, sticky cart bar, checkout drawer) plus a footer. The "next week" preview and "Our way" sections were deliberately removed.
- "This week" = the first week in the menu whose order deadline hasn't passed. It rolls over to the next saved week automatically. If a later week is saved, it opens for ordering immediately after the previous deadline. With no later week, the page shows closed.
- `?now=YYYY-MM-DD` on the URL previews the page as of another date.
- Stock: each bread has a limit. Sold-out breads show "Sold out"; the page polls `/api/stock` every 20s.
- Checkout fields: name, email, payment method, notes.
  - Cash: in person.
  - Bank transfer: opens a popup with the TWQR code (`assets/bank-qr.png`, loaded only when the popup opens so link scrapers never grab it), bank code 玉山 808, the account number, the total, and a required "last 5 digits of the account you transferred from" box. Confirming the popup places the order.
  - The site cannot verify bank payments. Bank orders stay "New" until the owner marks them Paid in admin.
- Link preview card: `assets/og-image.png` with `og:` tags in `index.html`. They hardcode `https://bread-co.netlify.app`; update them if the domain changes. The image is a placeholder, so swap in a real photo when there is one.

## Menu data (important)
- Live menu is saved from the admin Menu tab into Netlify Blobs (store `bread-co`, key `weeks`). The public `GET /api/weeks` serves it only if `v === 2`.
- `data/weeks.json` is only the seed/fallback used when nothing valid is saved. Editing it does NOT change a menu that was already saved in admin.
- Schema: `{ v: 2, timezone, paymentNote, weeks: [{ id, deadline, delivery, items: [{ id, zh, en, tone, img, price, stock }] }] }`.
- Deadlines are wall-clock strings `YYYY-MM-DDTHH:MM` in `timezone` (default `Asia/Taipei`), converted by `shared/time.js` (`wallToEpoch`).

## Orders and stock (the tricky part)
- Orders live in the Blobs store `bread-orders` (strong consistency). Keys: `orders/<week>/<no>`, order numbers `no/<week>/<no>`, and one `slot/<week>/<item>/<k>` blob per loaf.
- Overselling is prevented by "slots": each loaf is a numbered blob created with `onlyIfNew`, so two buyers can never get the same loaf. If an order can't get all its loaves, everything it claimed is released (`claimSlots` in `netlify/lib/data.mjs`, `placeOrder` in `netlify/functions/orders.mjs`).
- Cancelling an order deletes its slots, which puts the loaves back on sale. A cancelled order can't be reopened or edited.
- The deadline is enforced on the server (410 "closed"), not just on the page.
- Local `netlify dev` blobs are NOT atomic for `onlyIfNew`. Concurrency can't be proven locally. Sequential tests (add, edit, cancel, stock limits) do work locally.

## Admin (`/admin/`)
- Auth: `x-admin-password` header checked against env `ADMIN_PASSWORD` (timing-safe, with a delay on failure).
- Orders tab: choose a week, "To bake" summary, spreadsheet-style table (# | Name | Email | Order | Payment | Notes | Status), CSV download, status dropdown (New / Paid / Delivered / Cancelled), resend confirmation email.
- Owner can **add** and **edit** orders at any time, including after the deadline (`POST /api/admin/orders`, `PATCH` with `action: "edit"`). Editing re-claims or releases loaves to match the new quantities. If it would exceed stock it returns 409 and says to raise the stock in the Menu tab. Admin-added or edited orders send no emails automatically.
- Menu tab: timezone, payment note, weeks with deadline/delivery, per-bread zh/en/price/stock/colour/photo. Save publishes it.

## Email
- Customer gets a bilingual confirmation after ordering; the owner gets an alert. A failed email never fails the order (`emailStatus` is stored on the order).
- Provider via env vars: Gmail SMTP (`GMAIL_USER`, `GMAIL_APP_PASSWORD`) or Resend (`RESEND_API_KEY`, `EMAIL_FROM`). Also `OWNER_EMAIL` (alerts and reply-to) and optional `EMAIL_FROM_NAME`.
- Code is in `netlify/lib/email.mjs`. Setup steps are in `README.md`.

## Netlify environment variables
`ADMIN_PASSWORD`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `OWNER_EMAIL` (optionally `EMAIL_FROM_NAME`). A redeploy is needed after changing them.

## Known gaps and open items
- The bank QR in `assets/bank-qr.png` showed an expiry date of 2026-10-29 in the bank app. Replace it with a non-expiring or fresh one if customers report scan failures.
- Bank payment is trust-based. The owner matches transfers by the last-5 digits, then marks the order Paid.
- Production atomicity of `onlyIfNew` (the stock slots) was assumed from Netlify's documented behaviour. Not load-tested on the real site.
- No photos yet. Bread cards use coloured arches; photos can be uploaded per bread in the admin Menu tab (JPG/PNG/WebP, 4 MB max).
- No delivery-address field (the owner left it out of checkout on purpose).
- Currency symbol is hardcoded as `NT$` in `script.js`, `admin/admin.js` and `netlify/lib/email.mjs` (the `money` helpers).
