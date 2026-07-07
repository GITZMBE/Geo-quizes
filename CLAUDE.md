# Geo Quizzes

Interactive geography quiz web app: log in with Google, play map-based quiz
games, compete on per-game leaderboards. See `README.md` for stack summary
and local setup/run commands — this file covers conventions and gotchas an
agent working in this repo needs to know.

## Architecture gotchas (read before touching auth/state/data)

- **Auth is split into two files** to keep Prisma out of the Edge runtime:
  `lib/auth.config.ts` is the Edge-safe base (providers, JWT callbacks, no
  adapter) and is what `proxy.ts` uses directly. `lib/auth.ts` extends it with
  the Prisma adapter, for use only in pages/API routes. Don't import
  `lib/auth.ts` from `proxy.ts` or anything else that runs in Edge middleware.
- **`proxy.ts`** (Next.js 16 renamed `middleware.ts` → `proxy.ts`) gates all
  page routes behind login except `/`, but its matcher **excludes `/api/*`
  entirely** — API routes return their own 401 JSON via each route's own
  `auth()` check, rather than being redirected to an HTML page.
- **Recoil does not survive Next.js's SSR/prerender pass under React 19** —
  calling `useRecoilState` while the server prerenders a page crashes with a
  `ReactCurrentDispatcher` error. Every page that uses Recoil-backed game
  state is a thin `"use client"` `page.tsx` that loads the real component via
  `next/dynamic(() => import(...), { ssr: false })`. Follow this pattern for
  any new game page — see `app/games/stockholm-stadsdelar/page.tsx` /
  `StockholmGame.tsx` for the reference split.
- **Prisma uses the new `prisma-client` generator** (not `prisma-client-js`),
  output to `app/generated/prisma/`. Import from
  `@/app/generated/prisma/client`, not `@prisma/client` directly.
  `prisma.config.ts` (not the `package.json` `prisma` key) drives the CLI.
- **React 19's stricter effect-rules lint** (`react-hooks/set-state-in-effect`,
  `react-hooks/refs`) will fail CI-equivalent checks if you call `setState`
  synchronously in an effect body (do it inside a `.then`/callback instead) or
  mutate a ref during render (assign it inside a `useEffect`). Run
  `npx tsc --noEmit && npm run lint` after any change.
- Score types are `POINTS` (higher is better) or `TIME_MS` (lower is better);
  `app/api/games/[slug]/leaderboard/route.ts` sorts ascending/descending
  accordingly based on the mode's `scoreType` in the registry.

## Adding a new game

Use the **`new-game` skill** (`.claude/skills/new-game/SKILL.md`) — it covers
choosing points-vs-polygons data shape, sourcing coordinates from GeoNames
without fabricating them, the two canonical JSON envelopes, registering in
`lib/games/registry.ts`, and the page-scaffolding patterns (GlobeView,
Recoil atom shape, score submission, leaderboard). Don't invent a third data
shape or reimplement patterns it already documents.

`lib/games/registry.ts` is the single source of truth for game/mode slugs,
display names, and data file paths — both the UI and the API routes read
from it. `lib/games/data.ts` has the shared fetch helpers (`fetchRegions`/
`fetchPoints`, plus `fetchDistricts`/`fetchCities` aliases for the existing
games).

## Games implemented

1. **Stockholm Districts** (`/games/stockholm-stadsdelar`) — district named,
   click its border on the map; POINTS, one pass through all districts.
2. **Sweden's Biggest Cities** (`/games/sweden-cities`) — three modes:
   - *Type them all* — free recall of the top 100, autocomplete kicks in only
     after 5+ chars typed **and** an unambiguous match remains; TIME_MS,
     scored only on full completion (giving up doesn't submit a score).
   - *Click the city* — named city, click its dot; POINTS.
   - *Guess the location* (maptap-style) — 5 random cities, click your guess
     on the map, scored by distance via `lib/games/geo.ts`
     (`haversineDistanceKm`/`proximityScore`); POINTS.

`public/data/sweden_largest_cities.json` coordinates were sourced from the
GeoNames Sweden dump and matched programmatically (`scripts/match-city-coords.js`)
— two localities (Västerhaninge, Nordöstra Göteborg) use documented proxy
coordinates since no exact GeoNames entry exists for those SCB locality
names; see the file's `note` field.

## Infra / deployment status

- **GitHub**: `https://github.com/GITZMBE/Geo-quizes.git` (repo was renamed
  from `Geo-quiz`; local folder and all in-repo references were renamed to
  match — `geo-quizes` is the canonical slug used in `package.json`, Docker
  Postgres credentials, etc.)
- **Database**: Neon Postgres, project `geo-quizes` (id
  `patient-shape-66081015`, region `aws-eu-central-1`). Connection string is
  in the local `.env` only (never committed). Initial migration has been
  applied directly against it.
- **Netlify**: site `geo-quizes` (account `gitzmbe`) is linked to
  `GITZMBE/Geo-quizes` on branch `master` for continuous deployment (reusing
  the account's existing GitHub App installation — linked via the Netlify API
  since local `netlify deploy` can't work on Windows: the Next.js plugin's
  packaging step needs symlinks, which are unprivileged-blocked on Windows).
  `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL` are set as env vars.
  `netlify.toml` build command runs `prisma migrate deploy && prisma generate`
  before `next build`, so schema migrations apply automatically each deploy.
- **Google OAuth**: `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are intentionally
  unset (pending). Login will not work anywhere — locally or deployed — until
  these are created in Google Cloud Console and set both locally and on
  Netlify, with redirect URIs for both `localhost:3000` and the Netlify URL.
