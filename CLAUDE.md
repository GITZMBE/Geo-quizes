# Geo Quizzes

Interactive geography quiz web app: sign up with email/password, play
map-based quiz games, compete on per-game leaderboards. See `README.md` for
stack summary and local setup/run commands — this file covers conventions
and gotchas an agent working in this repo needs to know.

## Architecture gotchas (read before touching auth/state/data)

- **Auth is Credentials-based (email + password + bcrypt), not OAuth.**
  `POST /api/auth/register` creates the `User` row (hashed password via
  `bcryptjs` — pure JS, no native binary, same reasoning as the Prisma
  adapter below). `lib/auth.ts`'s `authorize()` looks the user up and
  compares the password. There's no email verification or password-reset
  flow — out of scope unless asked for.
- **Auth is split into two files** to keep Prisma/bcrypt out of the Edge
  runtime: `lib/auth.config.ts` is the Edge-safe base (a stub Credentials
  provider whose `authorize` is never actually called — middleware only
  verifies the JWT, it never invokes a provider) and is what `proxy.ts` uses
  directly. `lib/auth.ts` extends it with the *real* `authorize()` and the
  Prisma adapter, for use only in pages/API routes. Don't import
  `lib/auth.ts` from `proxy.ts` or anything else that runs in Edge middleware.
- **`proxy.ts`** (Next.js 16 renamed `middleware.ts` → `proxy.ts`) gates all
  page routes behind login except `/`, `/sign-in`, `/sign-up`, but its matcher
  **excludes `/api/*` entirely** — API routes return their own 401 JSON via
  each route's own `auth()` check, rather than being redirected to an HTML
  page. It also redirects already-logged-in users away from `/sign-in` and
  `/sign-up` to `/games`.
- **State management is `nanostores`, not Recoil.** Recoil was the original
  choice but turned out to be fundamentally incompatible with React 19 —
  not just an SSR/prerender issue, it crashes at runtime in the browser too
  (`useRecoilState` reaches into
  `React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher`,
  whose shape changed in React 19, and Recoil hasn't been updated since).
  `lib/state/useGameState.ts` wraps `@nanostores/react`'s `useStore` to mirror
  `useRecoilState`'s exact `[state, setState]` shape (setState accepts a
  value or an updater function), so game components barely changed — see
  `lib/state/gameAtoms.ts` for the atom definitions. Use `useGameState` for
  any new per-component game state; there's no cross-component sharing
  currently, so plain nanostores atoms (not computed/derived stores) are
  the right level of complexity.
- **`GlobeView` (`components/GlobeView.tsx`) wraps `react-globe.gl`, not raw
  `globe.gl`.** An earlier version hand-rolled globe.gl's imperative Kapsule
  API directly (manual container ref, `new Globe(container)` in a
  `useEffect`, imperative `.polygonsData()`/`.onPointClick()`/etc. chains) and
  hit two rounds of real DOM-lifecycle crashes (`domNode.innerHTML = ""`
  throwing because the container was null/detached — confirmed both times by
  decompiling the actual crashing chunk, not guessed). `react-globe.gl` (same
  author, maintained React binding) handles all of that correctly — **pass
  layer data as props** (`polygonsData`, `pointColor`, `onPolygonClick`,
  `onGlobeClick`, etc., driven by component state/props) rather than calling
  methods imperatively on an instance. Use the forwarded `ref`
  (`useRef<GlobeMethods>(null)`) only for the couple of ref-only methods:
  `pointOfView()` and `controls()` (to set `enableRotate = false`). See
  `ClickDotMode.tsx` / `ProximityMode.tsx` for the pattern (point-based
  "guess the location" games, where a sphere is the more honest
  representation of the task). Don't reintroduce a manual globe.gl wrapper.
- **`polygonCapColor` can't have a nonzero-alpha "idle" fill on a
  many-polygon *globe* game.** three-globe's polygon cap material is
  `transparent` with `depthWrite: true` — a known bad combination once more
  than a couple of same-frame polygons use it: confirmed by bisecting an
  earlier globe-based US States prototype (50 states) that 2 simultaneously-
  tinted caps render clean but 3+ produce a hazy color wash across the
  *entire* globe, not just the polygons themselves. This is why click-a-
  region games moved to `MapView` (below) instead of chasing this further —
  if a future game ever renders many polygons on `GlobeView`, the fix is:
  return fully transparent (`"rgba(0, 0, 0, 0)"`, not a low-alpha tint) for
  every "idle" polygon, and only return a real color for the handful (1-2)
  actually highlighted for correct/wrong feedback at any instant.
- **`MapView` (`components/MapView.tsx`) is a flat 2D map (d3-geo + SVG),
  used for click-a-region games instead of `GlobeView`.** Stockholm
  Districts and US States both moved off `GlobeView` to `MapView` — a flat
  projection is easier to click precisely than a rotatable sphere, and
  sidesteps globe-only problems entirely (the `polygonCapColor` bug above,
  Alaska/Hawaii camera framing, rotation-lock tradeoffs). Pass
  `regionsData`/`fill`/`stroke`/`onRegionClick`/`label` as props, same
  props-driven pattern as `GlobeView`. Gotchas specific to it:
  - **Projection choice matters more than it looks.** `"mercator"` (default)
    is fine for a single contiguous landmass. `"albersUsa"` natively insets
    Alaska/Hawaii for the US States game. `"pacific"` (Mercator rotated
    180°) exists because Oceania's own countries straddle the antimeridian
    (Fiji spans -180..180, Kiribati -171.7..174.8) — the default Mercator's
    `fitSize` bounding-box blows up to ~360° of longitude and squeezes every
    country into a sliver otherwise. Add more rotated variants here rather
    than fixing it in each game's data.
  - **A real, non-self-intersecting polygon can still render as an unfilled
    hole near the poles.** Confirmed with Canada's Ellesmere Island
    (82.5°N): `@turf/kinks` found zero self-intersections in the source
    geometry, so this is a d3-geo Mercator-at-extreme-latitude edge case,
    not a data bug — neither rewinding (`@turf/rewind`) nor
    `fillRule="evenodd"` fixed it. The data-prep-side fix is to drop any
    ring reaching past ±80° latitude (see `scripts/build-world-countries.js`'s
    `dropTinyRings`) — the same kind of threshold real web maps use (Web
    Mercator caps at ~85.05°N/S).
  - **A disproportionately large transcontinental country can dominate a
    continent map's `fitSize` bounds.** Russia's Asian extent squeezed all
    of Western/Central Europe into unclickable slivers on the Europe map —
    fixed by clipping Russia's *map* geometry to west of the Urals
    specifically (`scripts/build-world-countries.js`'s
    `clipToEuropeanRussia`); its capital/flag data is unaffected since
    those don't depend on the polygon extent.
- **Prisma uses `prisma-client-js` with `engineType = "client"`**, output to
  `app/generated/prisma/`. Import from `@/app/generated/prisma`, not
  `@prisma/client` directly. `lib/prisma.ts` constructs the client with
  `@prisma/adapter-neon` (connects over HTTP/WebSocket, not a direct TCP
  connection) — there is **no native query-engine binary** to bundle, which
  is what makes this work inside a Netlify Function at all. Two things that
  look like reasonable fixes but are dead ends, already tried:
  - The newer `prisma-client` TS generator doesn't implement the `adapter`
    option at all (prisma/prisma#28073).
  - Passing `{ adapter }` to `PrismaClient` with `prisma-client-js` but
    *without* `engineType = "client"` silently does nothing — it still loads
    the native library engine. Verify any future Prisma changes by removing
    the local `query_engine-windows.dll.node` and confirming queries still
    work; if they don't, the adapter isn't actually being used.
  - `prisma.config.ts` (not the `package.json` `prisma` key) drives the CLI.
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
nanostores atom shape via `useGameState`, score submission, leaderboard).
Don't invent a third data shape or reimplement patterns it already
documents. The skill predates `MapView` and `useRoundGame` (see the
gotchas above and the Countries-of-`<continent>` games below) — for a new
click-a-region game, prefer `MapView` over `GlobeView` unless the game is
genuinely globe-scale/rotatable; for a new game that's really N near-
identical instances of the same round shape (e.g. one per continent/
category), prefer `useRoundGame` + a shared mode component over one-off
per-instance files.

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

3. **Five Cities Across the World** (`/games/world-cities`) — one mode,
   *Guess the location*: 5 random cities from the top 120 most populous
   cities worldwide, click your guess on the freely-rotatable globe; POINTS,
   scored by distance via `proximityScore(distanceKm, decayKm)` — this game
   passes a much larger `decayKm` (3000, vs. the 600 default tuned for
   Sweden's country-scale game) so a right-continent guess still earns
   partial credit at world scale.

`public/data/world_largest_cities.json` coordinates and populations come
from GeoNames' worldwide `cities15000` dump, filtered to feature class `P`
and sorted by population (`scripts/build-world-cities.js`) — no per-item
proxying needed, unlike the Sweden data.

4. **US States** (`/games/us-states`) — one mode, *Click the state*: a
   state is named, click its outline on a `MapView` using the `"albersUsa"`
   projection, which natively insets Alaska/Hawaii near the mainland;
   POINTS, one pass through all 50 states.

`public/data/us_states.json` borders come from geoBoundaries' USA ADM1
boundaries (public domain), filtered down to the 50 states (dropping DC +
5 territories that geoBoundaries includes in the same set) and simplified
(`scripts/build-us-states.js`) — both for file size (the raw simplified
release is still ~5MB, mostly Alaska/Hawaii coastline) and render
performance (Alaska alone had 586 separate island rings before dropping
ones under 0.5% of its largest ring's area).

5. **List All Countries** (`/games/world-countries`) — one mode, *Type them
   all*: free recall of all 197 sovereign countries, same autocomplete-and-
   guess pattern as Sweden's cities game; TIME_MS.
6. **Countries of Africa/Asia/Europe/North America/South America/Oceania**
   (`/games/countries-<continent>`) — each with three modes, all POINTS,
   one pass through that continent's countries:
   - *Countries* — named country, click its outline on a `MapView`
     (Oceania uses the `"pacific"` projection — see the `MapView` gotcha
     above).
   - *Capitals* — named country, type its capital.
   - *Flags* — flag shown, type the country name.

   These three modes are shared components (`components/games/
   {CountriesMapMode,CapitalsMode,FlagsMode}.tsx`) parameterized by
   `gameSlug` + country data, not one-off per-continent files — with 6
   continents × 3 modes being 18 near-identical instances of the same
   round-progression shape, that's genuinely warranted (see
   `lib/games/useRoundGame.ts`, and `getRoundState(key)` in
   `lib/state/gameAtoms.ts` for the per-instance persistent atom factory),
   unlike the one-off mode files every other game uses.

`public/data/world_countries.json` (points format) and
`public/data/countries_<continent>.json` (GeoJSON, one per continent) come
from Natural Earth's 1:50m Admin-0 country boundaries (public domain) for
borders/continent, GeoNames' `countryInfo.txt` for capitals, and
flagcdn.com for flag images (referenced by URL, not downloaded) —
`scripts/build-world-countries.js`. Natural Earth's raw set includes
dependencies/territories (Puerto Rico, Greenland, Hong Kong, etc.) and a
few disputed territories alongside real countries; the script filters
those out and documents exactly what's dropped and why in the output
file's own `note` field.

## Infra / deployment status

- **GitHub**: `https://github.com/GITZMBE/Geo-quizzes.git` (repo has been
  renamed twice — `Geo-quiz` → `Geo-quizes` → `Geo-quizzes`; local folder and
  all in-repo references renamed to match each time — `geo-quizzes` is the
  canonical slug used in `package.json`, Docker Postgres credentials, etc.)
- **Database**: Neon Postgres, project `geo-quizzes` (id
  `patient-shape-66081015`, region `aws-eu-central-1` — id and connection
  hostname are stable across the project's display-name renames). Connection
  string is in the local `.env` only (never committed). Initial migration has
  been applied directly against it.
- **Netlify**: site `geo-quizzes` (account `gitzmbe`) is linked to
  `GITZMBE/Geo-quizzes` on branch `master` for continuous deployment (reusing
  the account's existing GitHub App installation — linked via the Netlify API
  since local `netlify deploy` can't work on Windows: the Next.js plugin's
  packaging step needs symlinks, which are unprivileged-blocked on Windows).
  `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL` are set as env vars.
  `netlify.toml` build command runs `prisma migrate deploy && prisma generate`
  before `next build`, so schema migrations apply automatically each deploy.
  **Verified live and working** (`/api/games/*/leaderboard` returns 200,
  login redirect gating works, `/api/auth/session` clean) as of the
  `@prisma/adapter-neon` + `engineType = "client"` fix — this took several
  deploy cycles to get right, see the Prisma bullet above for the two dead
  ends already ruled out.
- **Auth**: switched from Google OAuth to a Credentials (email/password)
  provider — see the architecture bullet above. No `AUTH_GOOGLE_*` env vars
  needed anywhere anymore.
