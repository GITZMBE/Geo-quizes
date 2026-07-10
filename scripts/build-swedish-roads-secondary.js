// Builds the "secondary" tier of public/data/swedish_roads.json: secondary
// county roads (länsväg 500-2999), whose numbers are REUSED per county —
// disambiguated with a county-letter prefix (e.g. "AB 543"). Unlike tiers
// 1-3 (see build-swedish-roads-primary.js), there's no curated Wikipedia
// list for this tier: it's sourced entirely from OpenStreetMap, way by way,
// grouped by (county, ref), with endpoints derived by nearest-locality
// lookup against the full GeoNames Sweden dump (mirrors the approach in
// scripts/match-city-coords.js) rather than a human-written place name.
//
// This is the highest-risk/highest-effort tier (see CLAUDE.md/the project
// plan) — OSM's route-relation tagging that made tiers 1-3 clean
// (network=SE:RV/SE:LV) mostly doesn't exist for this tier; roads are
// identified by grouping raw ways that share a `ref` tag within one
// county's boundary, which is a much rougher signal (this can merge
// physically disconnected road stretches that happen to share a ref within
// the same county, or split a real single road if OSM's tagging is
// inconsistent). Every county is processed and cached independently
// (`.scratch-swedish-roads/secondary_<letter>.json`) so this script can be
// interrupted and resumed per county rather than needing a clean single
// run across all 21.
//
// Requires (installed --no-save, data-prep only):
//   npm install --no-save @turf/simplify

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const simplify = require("@turf/simplify").default;

const OVERPASS_URL = "https://z.overpass-api.de/api/interpreter";
const SCRATCH_DIR = path.join(__dirname, "..", ".scratch-swedish-roads");
fs.mkdirSync(SCRATCH_DIR, { recursive: true });

// Sweden's 21 counties: OSM admin_level=4 relation id (as an Overpass area
// id, i.e. +3600000000) and the standard "länsbokstav" (county letter)
// used to disambiguate secondary road numbers.
const COUNTIES = [
  { name: "Stockholms län", letter: "AB", relationId: 54391 },
  { name: "Uppsala län", letter: "C", relationId: 54220 },
  { name: "Södermanlands län", letter: "D", relationId: 54386 },
  { name: "Östergötlands län", letter: "E", relationId: 940675 },
  { name: "Jönköpings län", letter: "F", relationId: 54374 },
  { name: "Kronobergs län", letter: "G", relationId: 54412 },
  { name: "Kalmar län", letter: "H", relationId: 54417 },
  { name: "Gotlands län", letter: "I", relationId: 941530 },
  { name: "Blekinge län", letter: "K", relationId: 54413 },
  { name: "Skåne län", letter: "M", relationId: 54409 },
  { name: "Hallands län", letter: "N", relationId: 54403 },
  { name: "Västra Götalands län", letter: "O", relationId: 54367 },
  { name: "Värmlands län", letter: "S", relationId: 54223 },
  { name: "Örebro län", letter: "T", relationId: 54222 },
  { name: "Västmanlands län", letter: "U", relationId: 54221 },
  { name: "Dalarnas län", letter: "W", relationId: 52834 },
  { name: "Gävleborgs län", letter: "X", relationId: 52832 },
  { name: "Västernorrlands län", letter: "Y", relationId: 52827 },
  { name: "Jämtlands län", letter: "Z", relationId: 52826 },
  { name: "Västerbottens län", letter: "AC", relationId: 52825 },
  { name: "Norrbottens län", letter: "BD", relationId: 52824 },
];

const HIGHWAY_CLASSES = ["secondary", "tertiary", "unclassified"];
const MIN_REF = 500;
const MAX_REF = 2999;
const COUNTY_LETTERS = new Set(COUNTIES.map((c) => c.letter));

// Confirmed against real data during development: OSM already tags
// secondary/tertiary/unclassified county-road ways with the county letter
// baked directly into `ref` (e.g. "AB 646", "G 543") — NOT a bare number
// needing a prefix added here. A bare number in this same tag (e.g. "260")
// is a *primary* länsväg (100-499) way re-tagged on a locally-downgraded
// street classification — already covered by tier 1-3, must NOT be
// re-included here. `E 20`/`E 4.19`-style refs are E-road sub-segments
// ("E" collides with Östergötland's county letter) — the number-range
// check below excludes these (E-road numbers are all under 500).
function parseSecondaryRef(ref) {
  const m = ref.trim().match(/^([A-Za-z]{1,2})\s?(\d{3,4})$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const num = parseInt(m[2], 10);
  if (!COUNTY_LETTERS.has(letter)) return null;
  if (num < MIN_REF || num > MAX_REF) return null;
  return `${letter} ${num}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function overpass(query, { retries = 6, label = "" } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const queryFile = path.join(SCRATCH_DIR, "_query.tmp");
      fs.writeFileSync(queryFile, query);
      const text = execFileSync(
        "curl",
        ["-s", "-m", "170", "-X", "POST", OVERPASS_URL, "--data-binary", "@" + queryFile],
        { maxBuffer: 1024 * 1024 * 400, encoding: "utf8" }
      );
      const data = JSON.parse(text);
      if (!data.elements) throw new Error("no elements field: " + text.slice(0, 200));
      return data.elements;
    } catch (err) {
      lastErr = err;
      console.warn(`    [${label}] Overpass attempt ${attempt + 1} failed: ${err.message?.slice(0, 150)}`);
      await sleep(6000 * (attempt + 1));
    }
  }
  throw lastErr;
}

function pointsEqual(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

// Same greedy endpoint-chaining as build-swedish-roads-primary.js's
// assembleGeometry — a group of ways sharing one ref within a county isn't
// guaranteed to already be in end-to-end order.
function assembleGeometry(ways) {
  const segments = ways
    .map((w) => (w.geometry || []).filter(Boolean).map((pt) => [pt.lon, pt.lat]))
    .filter((c) => c.length >= 2);
  if (segments.length === 0) return null;
  const used = new Array(segments.length).fill(false);
  const lines = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let chain = segments[i].slice();
    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const seg = segments[j];
        const chainStart = chain[0];
        const chainEnd = chain[chain.length - 1];
        if (pointsEqual(chainEnd, seg[0])) chain = chain.concat(seg.slice(1));
        else if (pointsEqual(chainEnd, seg[seg.length - 1])) chain = chain.concat(seg.slice(0, -1).reverse());
        else if (pointsEqual(chainStart, seg[seg.length - 1])) chain = seg.slice(0, -1).concat(chain);
        else if (pointsEqual(chainStart, seg[0])) chain = seg.slice(1).reverse().concat(chain);
        else continue;
        used[j] = true;
        extended = true;
      }
    }
    lines.push(chain);
  }
  return lines.length === 1
    ? { type: "LineString", coordinates: lines[0] }
    : { type: "MultiLineString", coordinates: lines };
}

// Mirrors components/games/RoadsMode.tsx's geographicExtremes/SW-NE
// labeling exactly, so the fromPlace/toPlace text this script bakes into
// the data lines up with the endpoint markers the client independently
// computes from the same geometry at render time.
function geographicExtremes(geometry) {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const candidates = lines.flatMap((line) => [line[0], line[line.length - 1]]);
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const [aLng, aLat] = candidates[i];
      const [bLng, bLat] = candidates[j];
      const dist = (aLng - bLng) ** 2 + (aLat - bLat) ** 2;
      if (!best || dist > best.dist) best = { a: candidates[i], b: candidates[j], dist };
    }
  }
  return best ? [best.a, best.b] : [candidates[0], candidates[0]];
}

function swNe(geometry) {
  const [p1, p2] = geographicExtremes(geometry);
  const sw = p1[0] + p1[1] <= p2[0] + p2[1] ? p1 : p2;
  const ne = sw === p1 ? p2 : p1;
  return { sw, ne };
}

// --- GeoNames locality lookup for endpoint labels -----------------------

let localityIndex = null;
async function loadLocalities() {
  if (localityIndex) return localityIndex;
  const zipPath = path.join(SCRATCH_DIR, "SE.zip");
  const txtPath = path.join(SCRATCH_DIR, "SE.txt");
  if (!fs.existsSync(txtPath)) {
    if (!fs.existsSync(zipPath)) {
      console.log("  downloading GeoNames Sweden dump...");
      execFileSync("curl", ["-s", "-m", "60", "-o", zipPath, "https://download.geonames.org/export/dump/SE.zip"]);
    }
    // GNU tar (what's on PATH here) can't read .zip at all — shell out to
    // PowerShell's Expand-Archive instead, which is reliably present on
    // Windows regardless of what CLI archive tools happen to be installed.
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${SCRATCH_DIR}' -Force`,
    ]);
  }
  const raw = fs.readFileSync(txtPath, "utf8");
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const c = line.split("\t");
      return { name: c[1], lat: parseFloat(c[4]), lng: parseFloat(c[5]), featureClass: c[6], population: parseInt(c[14] || "0", 10) };
    })
    .filter((r) => r.featureClass === "P" && r.name);
  localityIndex = rows;
  console.log(`  loaded ${rows.length} localities`);
  return rows;
}

function nearestLocality(lng, lat, localities) {
  let best = null;
  for (const loc of localities) {
    const d = (loc.lng - lng) ** 2 + (loc.lat - lat) ** 2;
    if (!best || d < best.d) best = { d, loc };
  }
  return best?.loc.name ?? null;
}

// --- Per-county pipeline --------------------------------------------------

// A whole county used to be thrown away (0 roads) if even one highway
// class's tag query exhausted its retries — wasteful when the other two
// classes succeeded fine. Catch per-class and continue with whatever
// classes came through; log what was skipped rather than silently
// under-counting.
async function fetchCountyWayList(county) {
  const cachePath = path.join(SCRATCH_DIR, `secondary_${county.letter}_ways.json`);
  if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, "utf8"));

  const areaId = 3600000000 + county.relationId;
  let all = [];
  const skipped = [];
  for (const hw of HIGHWAY_CLASSES) {
    console.log(`  fetching ${hw} ways with ref in ${county.name}...`);
    try {
      const query = `[out:json][timeout:150];area(${areaId})->.a;way(area.a)["highway"="${hw}"]["ref"];out tags;`;
      const elements = await overpass(query, { label: `${county.letter}:${hw}:tags` });
      all = all.concat(elements.map((e) => ({ id: e.id, ref: e.tags.ref })));
    } catch (err) {
      console.warn(`  SKIPPING highway=${hw} for ${county.name}: ${err.message?.slice(0, 150)}`);
      skipped.push(hw);
    }
    await sleep(2000);
  }
  if (skipped.length) console.warn(`  [${county.letter}] incomplete — skipped classes: ${skipped.join(", ")}`);
  fs.writeFileSync(cachePath, JSON.stringify(all));
  return all;
}

// Same reasoning as fetchCountyWayList: a single stubborn chunk used to
// throw and lose every other chunk's already-fetched geometry for this
// county. Skip just that chunk's way ids (logged) and keep going.
async function fetchGeometryForIds(ids, cacheKeyPrefix) {
  const CHUNK = 150;
  const byId = new Map();
  const failedChunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const cachePath = path.join(SCRATCH_DIR, `${cacheKeyPrefix}_geom_${i}.json`);
    let elements;
    if (fs.existsSync(cachePath)) {
      elements = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      console.log(`    geometry chunk ${i + 1}-${i + chunk.length} of ${ids.length}...`);
      try {
        const query = `[out:json][timeout:170];way(id:${chunk.join(",")});out geom;`;
        elements = await overpass(query, { label: `${cacheKeyPrefix}:geom` });
        fs.writeFileSync(cachePath, JSON.stringify(elements));
      } catch (err) {
        console.warn(`    SKIPPING chunk ${i + 1}-${i + chunk.length}: ${err.message?.slice(0, 150)}`);
        failedChunks.push([i, i + chunk.length]);
        elements = [];
      }
      await sleep(2000);
    }
    for (const el of elements) if (el.type === "way") byId.set(el.id, el);
  }
  if (failedChunks.length) console.warn(`    [${cacheKeyPrefix}] ${failedChunks.length} chunk(s) skipped: ${JSON.stringify(failedChunks)}`);
  return byId;
}

async function processCounty(county, localities) {
  const outPath = path.join(SCRATCH_DIR, `secondary_${county.letter}_features.json`);
  if (fs.existsSync(outPath)) {
    const cached = JSON.parse(fs.readFileSync(outPath, "utf8"));
    console.log(`  [${county.letter}] cached: ${cached.length} roads`);
    return cached;
  }

  const wayRefs = await fetchCountyWayList(county);
  const byRef = new Map();
  for (const w of wayRefs) {
    const designation = parseSecondaryRef(w.ref);
    if (!designation) continue;
    if (!byRef.has(designation)) byRef.set(designation, []);
    byRef.get(designation).push(w.id);
  }
  console.log(`  [${county.letter}] ${wayRefs.length} candidate ways -> ${byRef.size} distinct secondary refs`);

  const allIds = [...new Set([...byRef.values()].flat())];
  const geomById = await fetchGeometryForIds(allIds, `secondary_${county.letter}`);

  const features = [];
  for (const [ref, ids] of byRef.entries()) {
    const ways = ids.map((id) => geomById.get(id)).filter(Boolean);
    const geometry = assembleGeometry(ways);
    if (!geometry) continue;
    const { sw, ne } = swNe(geometry);
    const fromPlace = nearestLocality(sw[0], sw[1], localities);
    const toPlace = nearestLocality(ne[0], ne[1], localities);
    if (!fromPlace || !toPlace) continue;
    const simplified = simplify({ type: "Feature", properties: {}, geometry }, { tolerance: 0.0015, highQuality: false });
    features.push({
      type: "Feature",
      properties: {
        name: ref,
        designation: ref,
        roadType: "lansvag",
        fromPlace,
        toPlace,
        // sw/ne ARE the exact points fromPlace/toPlace were looked up
        // against above, so storing them directly here is correct by
        // construction — no separate geocode-and-match step needed, unlike
        // the primary tier (see build-swedish-roads-primary.js), where
        // fromPlace/toPlace come from Wikipedia text with no built-in tie
        // to a geometry endpoint.
        fromLat: sw[1],
        fromLng: sw[0],
        toLat: ne[1],
        toLng: ne[0],
      },
      geometry: simplified.geometry,
    });
  }
  fs.writeFileSync(outPath, JSON.stringify(features));
  console.log(`  [${county.letter}] built ${features.length} secondary roads`);
  return features;
}

async function main() {
  const onlyLetters = process.argv.slice(2);
  const counties = onlyLetters.length ? COUNTIES.filter((c) => onlyLetters.includes(c.letter)) : COUNTIES;

  console.log("Loading GeoNames localities...");
  const localities = await loadLocalities();

  const allFeatures = [];
  const summary = [];
  for (const county of counties) {
    console.log(`\n=== ${county.name} (${county.letter}) ===`);
    try {
      const features = await processCounty(county, localities);
      allFeatures.push(...features);
      summary.push({ county: county.name, letter: county.letter, count: features.length });
    } catch (err) {
      console.error(`  FAILED for ${county.name}: ${err.message}`);
      summary.push({ county: county.name, letter: county.letter, count: 0, error: err.message });
    }
  }

  const outPath = path.join(SCRATCH_DIR, "swedish_roads_secondary.json");
  fs.writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features: allFeatures }));
  console.log(`\nWrote ${allFeatures.length} secondary-tier features to ${outPath}`);
  console.log("Per-county summary:", JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
