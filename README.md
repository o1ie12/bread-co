# Bread Co.

Static site (HTML/CSS/JS) on Netlify with its own order system and a private admin page.

## How ordering works

- The first screen of the site is the order page: customers pick a quantity of each bread, then check out
  (name, email, payment method, notes). Payment is in-person cash for now; bank transfer is shown as unavailable.
  No external form.
- Each bread has a **stock**. Every loaf is a numbered "slot" that can only be claimed once, so two people can
  never buy the last one at the same time. When stock hits 0 the bread shows **Sold out** automatically.
- Orders close at the week's deadline (checked on the server, not just in the browser).

## Admin page: `https://YOUR-SITE/admin`

- **Orders** tab: what to bake this week (sold / stock), every order with the customer's details, a status
  (New → Paid → Delivered, or Cancelled, which puts the loaves back on sale), and a CSV download.
- **Menu** tab: for each week set the order deadline, delivery day and the breads (中文 + English, price, stock,
  colour or photo). Also set the **shop timezone** (deadlines use it) and a **payment note** that customers see
  at checkout. Press **Save menu** to publish. The site picks the first week whose deadline hasn't passed as
  "this week" and previews the next one, so it rolls over by itself.

## Confirmation emails (optional, but recommended)

When someone orders, the site emails them a bilingual confirmation (items, total, delivery day, payment method)
and can email you a "new order" alert. Replies go to your `OWNER_EMAIL`. It sends through your own email account.
Add these in Netlify → **Site configuration → Environment variables** (mark the password/key as Secret), then redeploy.

**Option A: Gmail (no domain needed)**

| Key | Value |
| --- | --- |
| `GMAIL_USER` | the Gmail address to send from |
| `GMAIL_APP_PASSWORD` | a Google *App password* (Google Account → Security → 2-Step Verification → App passwords) |
| `OWNER_EMAIL` | where you want new-order alerts and customer replies |
| `EMAIL_FROM_NAME` | optional, defaults to `Bread Co.` |

**Option B: Resend** (needs your own domain): `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `Bread Co. <orders@yourdomain.com>`), `OWNER_EMAIL`.

If neither is set, orders still work and the confirmation screen just says we'll be in touch. In the admin each
order shows whether its email was sent and has a **Resend** button.

## One-time Netlify setup

1. Netlify → your site → **Site configuration → Environment variables → Add a variable**
2. Key: `ADMIN_PASSWORD`, Value: a long password you'll remember.
3. **Deploys → Trigger deploy → Deploy site** (the variable only applies to new deploys).

## Files

- `index.html`, `styles.css`, `script.js`: the public site and order page
- `admin/`: the admin page
- `netlify/functions/`: `weeks` (menu), `orders` (stock, placing orders, emails, admin order list), `photo` (uploads)
- `shared/time.js`: shop-timezone helper used by site, admin and server
- `data/weeks.json`: starting menu used until the first save in the admin
- `netlify.toml`, `package.json`: Netlify config and the `@netlify/blobs` dependency

Orders contain customers' names and emails. They're stored privately in Netlify Blobs and are only
readable with the admin password.
