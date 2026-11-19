# Equipra — server

Express 5 API for the Equipra equipment rental platform. MongoDB (native driver), JWT authorization, Stripe Checkout, deployed on Vercel as a serverless function.

Live URL: _pending (task S-15)_

## Endpoints

| Method | Path | Guard |
|---|---|---|
| GET | `/api/health` | public |

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

`GET /api/health` → `{ "ok": true }`

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | nodemon on `http://localhost:5000` |
| `npm start` | plain node |
| `npm run lint` | eslint |
| `npm test` | node test runner |
