---
name: new-game
description: Use when adding a new quiz/game to this project — scaffolding the page, registering it, and sourcing/formatting its geographic data (city coordinates or region borders).
---

# Adding a new game

This project's games live under `app/games/<slug>/`, are listed in
`lib/games/registry.ts`, and read their geo data from a JSON file in
`public/data/`. Follow this checklist for a new one.

## 1. Decide the shape: points or polygons

- **Points** (cities, landmarks, anything you click a dot for, or guess a
  location near): use the points format below.
- **Polygons** (regions/districts/countries you click the outline of): use
  standard GeoJSON.

## 2. Sourcing coordinates

**Points (cities/towns/localities):** use the free
[GeoNames](https://www.geonames.org/) bulk country dump —
`https://download.geonames.org/export/dump/<ISO2>.zip` (e.g. `SE.zip` for
Sweden, `NO.zip` for Norway, `DE.zip` for Germany). It's tab-separated with
columns: `geonameid, name, asciiname, alternatenames, latitude, longitude,
feature class, feature code, country code, cc2, admin1, admin2, admin3,
admin4, population, elevation, dem, timezone, modification_date`.

- Filter to `feature class == "P"` (populated places) — that excludes lakes,
  churches, administrative boundaries, etc. that share similar names.
- Match your source list's names against GeoNames' `name`, `asciiname`, and
  each entry in the semicolon/comma-separated `alternatenames` column.
- Normalize before matching: lowercase, strip diacritics (åä→a, ö→o, etc.),
  strip non-alphanumerics. Official statistics sources often use merged or
  compound locality names (e.g. Swedish SCB's "Upplands Väsby och
  Sollentuna") that won't exact-match a single GeoNames row — split on
  connector words/punctuation ("och", "/", "-") and try matching each part.
- When population data is available on both sides, prefer the
  highest-population match if a normalized name collides across multiple
  GeoNames rows (avoids matching a tiny hamlet that happens to share a name).
- **Never silently guess a coordinate.** If nothing matches, either drop the
  item, or pick the closest reasonable proxy (parish/administrative centroid,
  or the largest constituent sub-area) and *document the substitution in the
  data file's `note` field* — see `public/data/sweden_largest_cities.json`
  for the pattern (Västerhaninge and Nordöstra Göteborg entries).
- Keep the matching script (see `scripts/match-city-coords.js` for the
  reference implementation) around after use — it's cheap insurance if the
  source list changes later and documents exactly how the data was derived.

**Polygons (region/country borders):** source from open GIS boundary data —
national statistics offices' open data portals, OpenStreetMap extracts (e.g.
via Overpass or a service like geoBoundaries), or Natural Earth for
country-level borders. You want a GeoJSON `FeatureCollection` of
`Polygon`/`MultiPolygon` features, each with at least a `properties.name`.

## 3. Data file format

Two canonical shapes — don't invent a third. `lib/games/data.ts` has the
loaders for both.

**Points** — wrap in this envelope, `items` is required, everything else in
the item objects beyond `id`/`name`/`lat`/`lng` is game-specific extra data:

```json
{
  "kind": "points",
  "source": "where this came from",
  "note": "anything a future reader needs to know, including any proxy-coordinate substitutions",
  "items": [
    { "id": "1", "name": "Stockholm", "lat": 59.32938, "lng": 18.06871 }
  ]
}
```

Load with `fetchPoints<YourItemType>(url)` from `lib/games/data.ts` (define
`YourItemType` as `GamePoint & { ...yourExtraFields }`). See
`public/data/sweden_largest_cities.json` / `lib/games/data.ts`'s
`City`/`fetchCities` for a worked example with extra fields (`rank`,
`population`).

**Polygons** — plain, unwrapped GeoJSON, nothing extra added:

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "name": "Bagarmossen" }, "geometry": { "type": "Polygon", "coordinates": [...] } }
  ]
}
```

Load with `fetchRegions(url)` (aliased as `fetchDistricts` for the Stockholm
game) from `lib/games/data.ts`. Don't wrap GeoJSON in a custom envelope —
it's already a universal format, and keeping it standard means it can be
dropped straight into a GIS viewer or another tool for a sanity check.

Put the file in `public/data/<slug>.json`.

## 4. Register the game

Add an entry to `GAMES` in `lib/games/registry.ts`:

```ts
{
  slug: "your-game-slug",
  name: "Display Name",
  description: "One line shown on the games list/search page.",
  dataFile: "/data/your-game-slug.json",
  modes: [
    { slug: "mode-slug", name: "Mode display name", scoreType: "POINTS" }, // or "TIME_MS"
  ],
}
```

`scoreType` drives leaderboard sort order (`POINTS` sorts descending —
higher is better; `TIME_MS` sorts ascending — faster is better) via
`app/api/games/[slug]/leaderboard/route.ts`.

## 5. Scaffold the page

Create `app/games/<slug>/page.tsx`. Patterns already established in this
codebase to reuse rather than reinvent:

- **Map/globe rendering**: `components/GlobeView.tsx` — a thin sizing wrapper
  around `react-globe.gl` (not raw `globe.gl` — a hand-rolled imperative
  wrapper was tried twice and hit real DOM-lifecycle crashes both times).
  Pass layer data/config as **props** driven by component state
  (`polygonsData`, `pointsData`, `pointColor`, `onPolygonClick`,
  `onPointClick`, `onGlobeClick`, etc. — same names as globe.gl's chainable
  methods, just as props instead). Use a forwarded `ref`
  (`useRef<GlobeMethods>(null)`) only for the couple of ref-only methods:
  `pointOfView()` for the initial camera, and `controls().enableRotate =
  false` to lock it into "flat map" behavior for a country/region-scale quiz.
  Don't call layer/data methods imperatively on the ref — that's what broke
  last time.
- **Per-game round state**: a `nanostores` atom in `lib/state/gameAtoms.ts`
  (order/index/score/lastResult/finished shape — copy the pattern from
  `stockholmGameState` or `swedenClickDotState`), read via `useGameState`
  from `lib/state/useGameState.ts` (mirrors `useRecoilState`'s
  `[state, setState]` shape — Recoil itself was ripped out, it's
  fundamentally incompatible with React 19). Don't reach for Recoil again.
- **Client-only mode components**: these use browser-only APIs (globe.gl)
  and sit behind login with no SEO value, so load them via `next/dynamic`
  with `{ ssr: false }` from a thin `page.tsx` (see
  `app/games/stockholm-stadsdelar/page.tsx` and
  `app/games/sweden-cities/page.tsx` for the pattern) rather than using them
  directly in the page's default export.
- **Score submission**: `submitScore(gameSlug, modeSlug, value)` from
  `lib/games/scores.ts` once a run finishes.
- **Leaderboard display**: `<Leaderboard gameSlug={...} mode={...} />` from
  `components/Leaderboard.tsx`. Give it a `key` that changes per finished run
  (e.g. `key={String(state.finished)}`) rather than passing a refresh prop —
  that remounts it with fresh state instead of resetting state imperatively
  inside an effect (avoids the `react-hooks/set-state-in-effect` lint error).
- **Distance/scoring math** for proximity-style modes:
  `haversineDistanceKm()` and `proximityScore()` in `lib/games/geo.ts`.

## 6. Wire up feedback + verify

- Typecheck (`npx tsc --noEmit`) and lint (`npm run lint`) after scaffolding
  — this project runs React 19's stricter effect rules
  (`react-hooks/set-state-in-effect`, `react-hooks/refs`); avoid calling
  `setState` synchronously in an effect body (do it inside a `.then`/callback
  instead, or key a child component to force remount) and avoid mutating a
  ref during render (assign it inside a `useEffect`).
- Smoke-test the actual game in a running dev server before considering it
  done — map click-hit-testing and coordinate accuracy don't show up in a
  type check.
