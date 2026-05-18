# YouTube Hook Generator - Deployment Guide

## Quick Deploy to Vercel

### Step 1: Push to GitHub

```bash
cd youtube-hook-generator
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### Step 2: Create Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Click "Add New..." > "Project"
4. Import your GitHub repository
5. Click "Import"

### Step 3: Set Environment Variables

In the Vercel project settings:

1. Go to **Settings** > **Environment Variables**
2. Add the following variables:

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key (get at [openrouter.ai/keys](https://openrouter.ai/keys)) |
| `UNLOCK_CODES` | JSON array of valid unlock codes, e.g. `["HOOK-A1B2-C3D4","HOOK-E5F6-G7H8"]` |
| `UNLOCK_SECRET` | Random secret for signing auth tokens (generate with `openssl rand -hex 32`) |

### Step 4: Deploy

1. Click **Deploy**
2. Vercel will auto-deploy from your `main` branch
3. Wait ~30 seconds for deployment to complete

### Step 5: Update Payment Link

1. The Ko-fi link is in the paywall modal in `index.html`
2. Default is `https://ko-fi.com/shub465505`
3. Replace with your own Ko-fi if needed
4. Push changes to GitHub (Vercel auto-redeploys)

### Step 6: Custom Domain (Optional)

1. In Vercel dashboard, go to **Settings** > **Domains**
2. Add your custom domain
3. Configure DNS records as instructed

---

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI generation |
| `UNLOCK_CODES` | Yes* | JSON array of valid premium unlock codes |
| `UNLOCK_SECRET` | Yes* | Secret key for HMAC token signing |

*Required for premium features (script & video plan generation)

---

## Local Development

```bash
npm install
npm run dev
```

Server runs at `http://localhost:3000`

Create a `.env` file in the project root:
```
OPENROUTER_API_KEY=your_key_here
UNLOCK_CODES=["HOOK-TEST-ABCD"]
UNLOCK_SECRET=your_random_secret_key_at_least_32_chars
```

---

## Security Features

- **Server-side paywall enforcement**: Unlock codes validated server-side; HMAC-signed tokens issued to authenticated clients
- **Client-bound tokens**: Tokens cryptographically bound to a unique client ID
- **Rate limiting**: Per-IP rate limiting on all API endpoints
- **Input validation**: All user inputs sanitized, typed, and length-checked on the server
- **Request size limits**: Maximum payload sizes enforced on all endpoints
- **Security headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, Referrer-Policy
- **No secrets in client code**: API keys and unlock codes never exposed to the browser
