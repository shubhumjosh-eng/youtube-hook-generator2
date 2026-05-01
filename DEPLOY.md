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
2. Add the following variable:
   - `OPENROUTER_API_KEY` = Your OpenRouter API key
3. Get your API key at [openrouter.ai/keys](https://openrouter.ai/keys)

### Step 4: Deploy

1. Click **Deploy**
2. Vercel will auto-deploy from your `main` branch
3. Wait ~30 seconds for deployment to complete

### Step 5: Update Gumroad Link

1. Open `script.js` in your codebase
2. Find `const GUMROAD_URL = '...'`
3. Replace `https://yourusername.gumroad.com/l/hooks` with your actual Gumroad product link
4. Also update the `paywall-btn-primary` href in `index.html`
5. Push the change to GitHub (Vercel will auto-redeploy)

### Step 6: Custom Domain (Optional)

1. In Vercel dashboard, go to **Settings** > **Domains**
2. Add your custom domain
3. Configure DNS records as instructed

---

## Environment Variables Summary

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key (required) |

---

## Usage Limits

- Free tier: 3 generations (stored in `localStorage`)
- Paid tier: Unlimited (after Gumroad purchase)

---

## Local Development

```bash
npm install
npm run dev
```

Server runs at `http://localhost:3000`

Note: The API endpoint requires the `OPENROUTER_API_KEY` env var to work locally. Create a `.env` file:

```
OPENROUTER_API_KEY=your_key_here
```
