  # Privacy Mirror (Next.js)

Shows what a site can learn about a visitor — plus server-side IP/ASN/geo.

## Deploy to Cloudflare Pages (Beginner-Friendly)
1) Create a **new GitHub repo** and upload this folder (or use the GitHub import in Cloudflare).
2) In **Cloudflare Dashboard → Pages → Create a project** → **Connect to Git** → pick your repo.
3) Framework preset: **Next.js** (auto-detected). Build command: `npm run build`. Output: auto.
4) Click **Save and Deploy**. When it finishes, visit your Pages URL.

The API route `/api/whoami` reads **Cloudflare's `request.cf`** (country, city, region, ASN, org) and **`cf-connecting-ip`**—no third-party lookups.

## Local Dev
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Custom Domain (Optional)
- In Pages → your project → **Custom domains** → add your domain and follow prompts.

## Zero-Logging
- This project does **not** save data server-side. If you add analytics later, keep it **opt-in**.
