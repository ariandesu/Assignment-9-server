# Equipra — server

REST API for **Equipra**, an equipment rental marketplace: owners list gear, an
admin approves it, customers book it and pay through Stripe Checkout.

Express 5 with the MongoDB native driver, JWT authorization issued by the Next.js
client's BetterAuth session, and Stripe Checkout for payments. Runs as a normal
long-lived Node process locally and as a Vercel serverless function in production.

- **Live URL:** _pending deployment (task S-15)_
- **Client repo:** https://github.com/ariandesu/Assignment-9-frontend
- **Database:** MongoDB Atlas

## Key features

- JWT verification for every protected route; the **role always comes from the
  database**, never from the token payload.
- Role guards: `verifyRenter`, `verifyOwner`, `verifyAdmin`, `verifyOwnerOrAdmin`.
- Server-side catalog search, filtering, sorting and pagination (regex-escaped,
  limit capped at 24).
- Server-side pricing in integer BDT — the client can never dictate a price.
- Availability checks against paid bookings and unexpired holds, with a 30-minute
  reservation hold before payment.
- Stripe Checkout in BDT with a signature-verified webhook and one idempotent
  `confirmBooking` shared by `/payments/confirm` and the webhook.
- Analytics for the admin and owner dashboards via MongoDB aggregation pipelines.
- Scheduled housekeeping: completes finished paid bookings and cancels expired
  unpaid holds.

## Packages

Runtime: `express`, `mongodb`, `cors`, `jsonwebtoken`, `stripe`, `node-cron`,
`dotenv`.
Development: `nodemon`, `eslint`, `@eslint/js`, `globals`.

## Environment variables

Names only — never commit values. Copy `.env.example` to `.env`.

| Variable | Purpose |
|---|---|
| `PORT` | Local listen port (default 5000) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `DB_NAME` | Database name (`equipra_dev` locally, `equipra` in production) |
| `CLIENT_URLS` | Comma-separated allowed client origins (CORS + payment redirects) |
| `JWT_SECRET` | HS256 signing secret — must equal the client's |
| `JWT_ISSUER` | Expected token issuer (`equipra-web`) |
| `JWT_AUDIENCE` | Expected token audience (`equipra-api`) |
| `STRIPE_SECRET_KEY` | Stripe secret key (Checkout sessions) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `CRON_SECRET` | Bearer secret for `/api/cron/complete-bookings` |

## API

Base path `/api`. Lists return `{ items, total, page, pages }`, single resources
return `{ data }`, errors return `{ message }` with a proper status code.

| Method | Path | Guard | Notes |
|---|---|---|---|
| GET | `/health` | public | `{ ok: true }` |
| GET | `/stats/public` | public | `{ listings, cities, completedRentals, avgRating }` |
| GET | `/equipment` | public | approved only; `search`, `category`, `rentalType`, `minPrice`, `maxPrice`, `availability`, `sort`, `page`, `limit` |
| GET | `/equipment/featured` | public | newest 6 approved |
| GET | `/equipment/categories` | public | counts per approved category |
| GET | `/equipment/:id` | verifyToken | approved → any logged-in user; pending/rejected → owner or admin only, else 404 |
| POST | `/equipment` | verifyToken, verifyOwner | whitelisted fields; `status: 'pending'`; `owner` from the DB user |
| GET | `/equipment/mine/list` | verifyToken, verifyOwner | owner's equipment, paginated |
| PATCH | `/equipment/:id` | verifyToken, verifyOwnerOrAdmin | owner must own it; never sets `status`/`owner`; owner edits reset to pending |
| DELETE | `/equipment/:id` | verifyToken, verifyOwnerOrAdmin | 409 when upcoming paid bookings exist |
| GET | `/favorites` | verifyToken, verifyRenter | joined with equipment |
| POST | `/favorites` | verifyToken, verifyRenter | `{ equipmentId }`, idempotent |
| DELETE | `/favorites/:equipmentId` | verifyToken, verifyRenter | removes one favorite |
| GET | `/favorites/ids` | verifyToken, verifyRenter | `{ data: [equipmentIds] }` |
| POST | `/bookings` | verifyToken, verifyRenter | reservation; validates dates, quantity, BD phone, address; server-side pricing; 30-minute hold |
| GET | `/bookings/mine` | verifyToken, verifyRenter | paginated, newest first |
| GET | `/bookings/owner` | verifyToken, verifyOwner | bookings of the owner's equipment |
| GET | `/admin/bookings` | verifyToken, verifyAdmin | all bookings, paginated, `status` filter |
| PATCH | `/admin/bookings/:id/status` | verifyToken, verifyAdmin | `confirmed` / `completed` / `cancelled` |
| POST | `/payments/checkout` | verifyToken, verifyRenter | `{ bookingId }` → `{ url }` (Stripe Checkout, BDT) |
| POST | `/payments/confirm` | verifyToken, verifyRenter | `{ sessionId }` → booking + payment |
| POST | `/payments/webhook` | Stripe signature | raw body, `checkout.session.completed` |
| GET · PATCH | `/users/me` | verifyToken | PATCH whitelist: name, image, phone, address |
| GET | `/admin/users` | verifyToken, verifyAdmin | paginated, search by name/email |
| PATCH | `/admin/users/:id/role` | verifyToken, verifyAdmin | customer/owner/admin; cannot change own role |
| DELETE | `/admin/users/:id` | verifyToken, verifyAdmin | cannot delete self; removes sessions and accounts too |
| GET | `/admin/equipment` | verifyToken, verifyAdmin | all statuses, `status` filter |
| PATCH | `/admin/equipment/:id/status` | verifyToken, verifyAdmin | `approved` / `rejected` |
| GET | `/analytics/admin` | verifyToken, verifyAdmin | platform KPIs, revenue and a 6-month bookings series |
| GET | `/analytics/owner` | verifyToken, verifyOwner | owner KPIs, status mix and a 6-month earnings series |
| GET | `/cron/complete-bookings` | `Bearer CRON_SECRET` | completes past bookings, cancels expired holds |

## Local run

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # nodemon on http://localhost:5000
```

```bash
curl http://localhost:5000/api/health        # {"ok":true}
curl "http://localhost:5000/api/equipment"   # {"items":[...],"total":n,...}
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | nodemon on `http://localhost:5000` |
| `npm start` | plain node (production) |
| `npm run lint` | eslint |
| `npm test` | node test runner (pricing + availability) |

## Cron and webhooks

- **In-process schedule:** `src/server.js` registers node-cron hourly
  (`0 * * * *`) only when `VERCEL` is absent, because serverless functions cannot
  keep timers between invocations.
- **Serverless fallback:** `vercel.json` declares a daily cron for
  `GET /api/cron/complete-bookings`. Vercel sends
  `Authorization: Bearer <CRON_SECRET>`; the route returns 503 when that secret is
  unset and 401 when it does not match.
- **Stripe webhook:** point the endpoint at
  `https://<server-domain>/api/payments/webhook` and subscribe to
  `checkout.session.completed`. The route mounts `express.raw()` **before**
  `express.json()` so the signature is verified against the raw body.

## Deployment notes

- `api/index.js` exports the Express app for Vercel; `app.js` never calls `listen`.
- The Mongo client is cached on `globalThis` so warm invocations reuse the pool.
- Add every environment variable from the table above in the Vercel dashboard,
  mirroring `JWT_SECRET`, `JWT_ISSUER` and `JWT_AUDIENCE` from the client project.
