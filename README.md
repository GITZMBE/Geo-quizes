# Geo Quizzes

Interactive geography quiz app. Sign in with Google to play map-based quizzes and climb the leaderboards.

## Stack

- **Next.js** (App Router, TypeScript) — frontend + API routes in one app
- **Tailwind CSS v4** — theme tokens defined in `app/globals.css` (`@theme`), used as `bg-primary`, `text-error`, etc.
- **Recoil** — client-side game state
- **globe.gl** — interactive map/globe visualizations (`components/GlobeView.tsx`)
- **Prisma + PostgreSQL** — users, games, scores
- **Auth.js (NextAuth v5)** — Google OAuth, JWT sessions (`lib/auth.config.ts` is the Edge-safe base used by `proxy.ts`; `lib/auth.ts` extends it with the Prisma adapter for use in routes/pages)
- **Docker** — app + Postgres via `docker-compose.yml`

## Games

- **Stockholm Districts** (`/games/stockholm-stadsdelar`) — a district is named, click its outline on the map.
- **Sweden's Biggest Cities** (`/games/sweden-cities`) — three modes:
  - *Type them all* — free recall of the top 100 cities, ranked list as you go.
  - *Click the city* — a city is named, click its dot on the map.
  - *Guess the location* — 5 random cities, click your guess, scored by proximity.

Game data lives in `public/data/*.json`. `lib/games/registry.ts` is the source of truth for game/mode slugs used by the UI and the API routes.

## API

- `POST /api/scores` — submit a result (`{ gameSlug, mode, value }`), requires auth.
- `GET /api/games/[slug]/leaderboard?mode=<mode>` — top 10 scores for a game/mode.
- `GET|POST /api/auth/*` — handled by Auth.js.

## Local development

```bash
cp .env.example .env   # fill in DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID/SECRET
npm install
npx prisma migrate dev
npm run dev
```

Generate `AUTH_SECRET` with `npx auth secret`. Create Google OAuth credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with redirect URI `http://localhost:3000/api/auth/callback/google`.

## Docker

```bash
docker compose up --build
```

Runs the app + a Postgres container. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` in your shell/`.env` before starting — `docker-compose.yml` passes them through.

## Deployment

Configured for **Netlify** (`netlify.toml`, `@netlify/plugin-nextjs`). Set the same env vars (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NEXTAUTH_URL`) in the Netlify site's environment settings — the local Dockerized Postgres is dev-only, production needs a reachable hosted Postgres instance.
