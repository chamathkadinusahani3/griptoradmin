## Getting Started

1. Run `npm install`
2. Run `npm run dev`

## Backend (MongoDB + Vercel serverless API)

This app now has a real backend under `/api`, backed by MongoDB. `npm run dev` (plain Vite) will **not** serve `/api/*` — use it only when you're not touching data-backed pages.

1. Copy `.env.example` to `.env.local` and fill in `MONGODB_URI` and `JWT_SECRET`.
2. Create your login users (run once per user):
   ```
   npx tsx api/_lib/seed.ts --role super --name "Your Name" --email you@example.com --password "choose-a-password"
   npx tsx api/_lib/seed.ts --role tenant --name "Garage Owner" --email owner@garage.com --password "choose-a-password" --garage "Garage Name"
   ```
3. Run `npm run dev:full` (wraps `vercel dev`) to serve the Vite app and `/api` functions together, then sign in at the login page with the credentials you just seeded.
