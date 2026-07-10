# Deploying Tallio

Tallio is a **static** web app. Hosting serves only the app's code (HTML/JS/CSS/fonts).
**No server ever receives, stores, or backs up user data** — every byte of financial
data stays in the user's own browser storage on their own machine. There is no backend,
no database, and no serverless functions to deploy.

## Build

```bash
npm install
npm run build      # outputs static files to dist/
npm run preview    # optional: serve dist/ locally to sanity-check the production build
```

Build output directory: **`dist/`**. Build command: **`npm run build`**.

## Host on Cloudflare Pages (recommended)

Two ways:

**A. Connect the Git repo (auto-deploy on push)**
1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Pick this repository and branch.
3. Framework preset: **Vite**. Build command: `npm run build`. Output dir: `dist`.
4. Deploy. Every push to the chosen branch redeploys automatically.

**B. Direct upload from your machine**
```bash
npm run build
npx wrangler pages deploy dist
```

Netlify works identically: build command `npm run build`, publish directory `dist`.
The `public/_redirects` file gives both hosts the SPA fallback (all paths → `index.html`).

## Custom domain

In the Pages project → **Custom domains** → add your domain (e.g. an available
`tallio.*`), then point its DNS as instructed. Cloudflare provisions HTTPS
automatically.

**HTTPS is required** — the installable PWA, the linked-live-file (File System Access
API), and persistent storage (`navigator.storage.persist()`) all need a secure context.
Cloudflare Pages / Netlify provide it out of the box; `http://` will silently disable
these features.

## What your friends do

1. Open the link once (needs internet the first time to download the app).
2. Their browser offers **Install** — accept it to get a real app icon and its own
   window. After that it works fully **offline**.
3. Their data is created and stored **only on their device**. To back it up or move it
   to another machine, use the **⋮ menu → Export** (writes a `.tallio` file) and
   **Restore from backup** to load one. On Chrome/Edge they can also **Save to a budget
   file** and have Tallio auto-save to it like a document.

## Privacy blurb (reuse in-app / when sharing the link)

> Tallio stores all of your data on your own device only. Nothing is uploaded to any
> server — not even as a backup. The website only delivers the app's code.
