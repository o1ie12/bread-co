# Bread Co.

Static site (HTML/CSS/JS) on Netlify, with a private admin page for the weekly menu.

## Updating the weekly menu

1. Go to `https://YOUR-SITE/admin`
2. Enter the admin password
3. Add or edit each week: order deadline, delivery day, and the breads (中文 + English, colour or photo)
4. Press **Save**. The site updates immediately, no redeploy needed.

The site treats the first week whose deadline hasn't passed as **this week** and the following week as **next week**, so it rolls over by itself.

## One-time Netlify setup

1. Netlify → your site → **Site configuration → Environment variables → Add a variable**
2. Key: `ADMIN_PASSWORD`, Value: a long password you'll remember. Scope: all scopes.
3. **Deploys → Trigger deploy → Deploy site** (the variable only applies to new deploys).

Data is stored with Netlify Blobs; `data/weeks.json` is the starting content the site falls back to before the first save.

## Files

- `index.html`, `styles.css`, `script.js`: the public site
- `admin/`: the admin page
- `netlify/functions/`: `weeks` (read/save the menu), `photo` (upload/serve photos)
- `netlify.toml`, `package.json`: Netlify config and the `@netlify/blobs` dependency
