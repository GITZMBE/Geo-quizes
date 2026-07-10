// Builds the "primary" tier of public/data/swedish_roads.json: E-roads
// (Europavägar), riksväg (1-99), and primary länsväg (100-499). Fetches
// live from two sources, both public APIs (no manual download step needed,
// unlike scripts/build-us-states.js's offline-source-file convention —
// these two sources are small/fast enough to hit directly):
//
//  - Swedish Wikipedia's "Lista över svenska vägar i nummerordning"
//    (action API, prop=wikitext) for each road's designation + ordered
//    place list (sträckning) — first/last place = fromPlace/toPlace.
//  - The Overpass API for each road's actual route relation (tagged
//    type=route, route=road, network=e-road|SE:RV|SE:LV, ref=<code>),
//    fetched with `out geom;` for full line geometry.
//
// Overpass endpoint notes (found by trial during development — the
// well-known overpass-api.de load-balances across several backends and
// some were unhealthy/empty when this was written; z.overpass-api.de was
// the one that returned real, current data):
//   OVERPASS_URL below.
// Rate limit observed: 2 concurrent slots per IP — this script runs
// everything sequentially with a short delay, never in parallel.
// Requests are shelled out to `curl`, not node's fetch() — node's fetch
// (undici) got a hard 406 from this exact server for a byte-identical
// query that curl succeeded on, back to back, repeatedly confirmed during
// development. Cause not fully root-caused (not Content-Type, not
// Accept/Accept-Encoding headers tried); curl is simply what's confirmed
// to work reliably against this endpoint.
//
// Requires (installed --no-save, data-prep only, same convention as
// build-us-states.js/build-world-countries.js):
//   npm install --no-save @turf/simplify

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const simplify = require("@turf/simplify").default;
const lineSlice = require("@turf/line-slice").default;
const nearestPointOnLine = require("@turf/nearest-point-on-line").default;
const { point, lineString } = require("@turf/helpers");

const OVERPASS_URL = "https://z.overpass-api.de/api/interpreter";
const SCRATCH_DIR = path.join(__dirname, "..", ".scratch-swedish-roads");
const SWEDEN_RELATION_AREA_ID = 3600052822; // OSM relation 52822 (Sverige) as an Overpass area id

fs.mkdirSync(SCRATCH_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function overpass(query, { retries = 6 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const queryFile = path.join(SCRATCH_DIR, "_query.tmp");
      fs.writeFileSync(queryFile, query);
      const text = execFileSync(
        "curl",
        ["-s", "-m", "170", "-X", "POST", OVERPASS_URL, "--data-binary", "@" + queryFile],
        { maxBuffer: 1024 * 1024 * 200, encoding: "utf8" }
      );
      const data = JSON.parse(text);
      if (!data.elements) throw new Error("no elements field: " + text.slice(0, 200));
      return data.elements;
    } catch (err) {
      lastErr = err;
      console.warn(`  Overpass attempt ${attempt + 1} failed: ${err.message?.slice(0, 200)}`);
      await sleep(8000 * (attempt + 1));
    }
  }
  throw lastErr;
}

// --- Step 1: parse the Wikipedia sträckning list -----------------------

function linkDisplay(token) {
  const m = token.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!m) return token.trim();
  return (m[2] || m[1]).trim();
}

const ROAD_TOKEN_RE = /^(E\d+|Riksväg \d+|Länsväg \d+)$/;

function extractPlaces(strackningRaw) {
  const s = strackningRaw.trim();
  const franTill = s.match(/^Från\s+(.+?)\s+till\s+(.+)$/i);
  if (franTill) return [linkDisplay(franTill[1]), linkDisplay(franTill[2])];

  const noParens = s.replace(/\([^)]*\)/g, "");
  let parts = noParens.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    parts = noParens.split(/[-–—]/).map((p) => p.trim()).filter(Boolean);
  }

  // A "part" isn't always a single place — a road-reference qualifier is
  // sometimes jammed against the real place with no dash between them
  // (e.g. "[[Riksväg 75]] [[Stockholm]]" meaning "the Stockholm end, near
  // Riksväg 75"), and a genuine two-place segment occasionally has no
  // spaces around its hyphen either ("[[Gullspång]]-[[Vintrosa]]"). Expand
  // every part into all of its bracketed tokens (or the whole part
  // verbatim, for an unbracketed plain-text place like "norska gränsen")
  // instead of collapsing each part to one display string via the first
  // bracket match.
  let places = parts.flatMap((part) => {
    const tokens = [...part.matchAll(/\[\[[^\]]+\]\]/g)].map((m) => linkDisplay(m[0]));
    return tokens.length ? tokens : [part];
  });

  const realPlaces = places.filter((p) => !ROAD_TOKEN_RE.test(p));
  if (realPlaces.length >= 1) places = realPlaces;
  return places;
}

function parseWikiSection(text, roadType) {
  const rows = text.split(/\n\|-\n/).slice(1);
  const results = [];
  for (const row of rows) {
    const cols = row.split("||");
    if (cols.length < 2) continue;
    const roadCol = cols[0].replace(/^\|\s*/, "").trim();
    let strackning = cols.slice(1).join("||").trim();
    strackning = strackning.split("\n|}")[0].split("\n|-")[0].trim();
    const roadDisplay = linkDisplay(roadCol);
    const designation =
      roadType === "motorway" ? roadDisplay.match(/^E\d+/)?.[0] : roadDisplay.match(/(\d+)/)?.[1];
    if (!designation) continue;
    const places = extractPlaces(strackning);
    results.push({
      designation,
      roadType,
      fromPlace: places[0] ?? null,
      toPlace: places[places.length - 1] ?? null,
    });
  }
  return results;
}

async function fetchWikiRoadList() {
  const cachePath = path.join(SCRATCH_DIR, "wiki_roads.json");
  let wikiJson;
  if (fs.existsSync(cachePath)) {
    wikiJson = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } else {
    const url =
      "https://sv.wikipedia.org/w/api.php?action=parse&page=Lista_%C3%B6ver_svenska_v%C3%A4gar_i_nummerordning&prop=wikitext&format=json";
    const res = await fetch(url);
    wikiJson = await res.json();
    fs.writeFileSync(cachePath, JSON.stringify(wikiJson));
  }
  const wikitext = wikiJson.parse.wikitext["*"];
  const sections = wikitext.split(/\n==\s*/).slice(1);
  const typeMap = { Europavägar: "motorway", Riksvägar: "riksvag", Länsvägar: "lansvag" };
  let all = [];
  for (const sec of sections) {
    const title = sec.split("\n")[0];
    const key = Object.keys(typeMap).find((k) => title.startsWith(k));
    if (!key) continue;
    const body = sec.split("\n").slice(1).join("\n");
    all = all.concat(parseWikiSection(body, typeMap[key]));
  }
  return all;
}

// --- Step 2: match each road to its OSM route relation(s) ---------------

function normRef(s) {
  return (s || "").replace(/\s+/g, "").toUpperCase();
}

// A handful of länsväg entries have a route relation with no `network` tag
// at all (confirmed during development: e.g. länsväg 360 = relation 52091,
// ref="360", route=road, type=route, but no network tag) — matched here as
// a same-ref fallback only when there's exactly one route=road relation
// for that bare ref among the untagged-network set, to avoid an ambiguous
// match against some other country's same-numbered road.
async function matchRelations(roads) {
  const allRoutes = await overpass(
    `[out:json][timeout:120];area(${SWEDEN_RELATION_AREA_ID})->.se;relation(area.se)["type"="route"]["route"="road"];out tags;`
  );
  const byNetworkRef = new Map();
  const byRefNoNetwork = new Map();
  for (const r of allRoutes) {
    const ref = normRef(r.tags.ref);
    if (!ref) continue;
    if (r.tags.network) {
      const key = r.tags.network + ":" + ref;
      if (!byNetworkRef.has(key)) byNetworkRef.set(key, []);
      byNetworkRef.get(key).push(r.id);
    } else {
      if (!byRefNoNetwork.has(ref)) byRefNoNetwork.set(ref, []);
      byRefNoNetwork.get(ref).push(r.id);
    }
  }

  const matched = [];
  const unmatched = [];
  for (const road of roads) {
    const net = road.roadType === "motorway" ? "e-road" : road.roadType === "riksvag" ? "SE:RV" : "SE:LV";
    const refKey = road.roadType === "motorway" ? normRef(road.designation) : road.designation;
    let ids = byNetworkRef.get(net + ":" + refKey) || [];
    if (!ids.length) {
      const fallback = byRefNoNetwork.get(refKey) || [];
      if (fallback.length === 1) ids = fallback;
    }
    if (ids.length) matched.push({ ...road, relationIds: ids });
    else unmatched.push(road);
  }
  return { matched, unmatched };
}

// --- Step 3: fetch geometry for matched relations, in chunks ------------

function wayGeomToCoords(way) {
  return way.geometry.filter(Boolean).map((pt) => [pt.lon, pt.lat]);
}

// A route relation's members may not concatenate into one continuous line
// (real gaps in OSM tagging, or genuinely disjoint carriageway directions
// for a divided highway) — greedily chain ways that share an endpoint,
// emit a LineString if everything chains into one, else a MultiLineString
// of whatever chains resulted.
function assembleGeometry(ways) {
  const segments = ways.map(wayGeomToCoords).filter((c) => c.length >= 2);
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
        const segStart = seg[0];
        const segEnd = seg[seg.length - 1];
        if (pointsEqual(chainEnd, segStart)) {
          chain = chain.concat(seg.slice(1));
        } else if (pointsEqual(chainEnd, segEnd)) {
          chain = chain.concat(seg.slice(0, -1).reverse());
        } else if (pointsEqual(chainStart, segEnd)) {
          chain = seg.slice(0, -1).concat(chain);
        } else if (pointsEqual(chainStart, segStart)) {
          chain = seg.slice(1).reverse().concat(chain);
        } else {
          continue;
        }
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

function pointsEqual(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

// --- Endpoint coordinates: geocode fromPlace/toPlace, CLIP the geometry to
// where they actually are ---------------------------------------------------
//
// fromPlace/toPlace are just Wikipedia text — nothing ties them to a
// specific end of the assembled OSM geometry. Two distinct bugs showed up
// here in sequence:
//  1. Which end is which: a road built from multiple relations/ways isn't
//     guaranteed to have its coordinate array ordered start-to-end, and an
//     earlier version had the client guess via compass direction (wrong for
//     any road that doesn't run southwest-to-northeast).
//  2. Overshoot: even after fixing #1 to label the correct *end* of the
//     drawn line, the OSM route relation itself can extend past the named
//     endpoint (e.g. E45's relation continues south of Göteborg toward
//     other infrastructure that Wikipedia's sträckning text doesn't count
//     as part of the named route) — so the line was still drawn longer
//     than the label implied.
// Fix for both: geocode the two place names, find the actual nearest point
// ON the line to each (not just among the line's own endpoints), and CLIP
// the geometry to end exactly at those two points — so the drawn line and
// its labels always agree, regardless of how far the underlying OSM
// relation actually extends.
function sqDist(lng, lat, p) {
  return (lng - p[0]) ** 2 + (lat - p[1]) ** 2;
}

// Finds the closest point to (targetLng, targetLat) across every sub-line
// of a LineString/MultiLineString, not just each sub-line's own endpoints —
// necessary since the named place is somewhere *along* the road, not
// necessarily right at one of the assembled geometry's own extremities.
function nearestOnLines(lines, targetLng, targetLat) {
  const pt = point([targetLng, targetLat]);
  let best = null;
  lines.forEach((coords, lineIndex) => {
    if (coords.length < 2) return;
    const np = nearestPointOnLine(lineString(coords), pt);
    if (!best || np.properties.dist < best.dist) {
      best = { lineIndex, dist: np.properties.dist, coord: np.geometry.coordinates };
    }
  });
  return best;
}

// Trims one sub-line so it runs from `hitCoord` to whichever of that
// sub-line's own two ends is farther from `hitCoord` — used only for the
// rare case where fromPlace/toPlace land on two different disconnected
// chains of a MultiLineString (a genuine gap in the route), so each
// relevant chain still gets trimmed back from its own far (unrelated) end.
function trimChainFromPoint(coords, hitCoord) {
  const farEnd =
    sqDist(hitCoord[0], hitCoord[1], coords[0]) > sqDist(hitCoord[0], hitCoord[1], coords[coords.length - 1])
      ? coords[0]
      : coords[coords.length - 1];
  return lineSlice(point(hitCoord), point(farEnd), lineString(coords)).geometry.coordinates;
}

// Returns the clipped geometry plus the two points actually used as its new
// ends (so callers can store those exact coordinates as fromLat/fromLng/
// toLat/toLng — the marker then always sits precisely on the drawn line's
// terminus, never floating off it at the geocoded point's raw location).
function clipGeometry(geometry, fromGeo, toGeo) {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const fromHit = nearestOnLines(lines, fromGeo.lng, fromGeo.lat);
  const toHit = nearestOnLines(lines, toGeo.lng, toGeo.lat);
  if (!fromHit || !toHit) return null;

  if (fromHit.lineIndex === toHit.lineIndex) {
    const sliced = lineSlice(point(fromHit.coord), point(toHit.coord), lineString(lines[fromHit.lineIndex]));
    return { geometry: { type: "LineString", coordinates: sliced.geometry.coordinates }, fromPoint: fromHit.coord, toPoint: toHit.coord };
  }

  // fromPlace and toPlace landed on two different disconnected chains — a
  // genuine gap in the route. Keep just those two chains, each trimmed back
  // from its own far end; drop any other unrelated chains entirely (the
  // same kind of extraneous relation content the single-chain case above
  // clips away, just shaped as a whole separate chain instead of a tail).
  const fromLine = trimChainFromPoint(lines[fromHit.lineIndex], fromHit.coord);
  const toLine = trimChainFromPoint(lines[toHit.lineIndex], toHit.coord);
  return {
    geometry: { type: "MultiLineString", coordinates: [fromLine, toLine] },
    fromPoint: fromHit.coord,
    toPoint: toHit.coord,
  };
}

// Fallback when geocoding fails for one/both place names (rare — e.g. a
// non-place token like "norska gränsen", the Norwegian border, which
// Nominatim can't resolve to a point) — keep the old "pick whichever raw
// geometry extremity is farther apart" behavior rather than dropping the
// road entirely. No clipping happens in this path since there's no real
// target point to clip to.
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

const geocodeCache = new Map();
// Nominatim's usage policy caps unauthenticated use at ~1 request/second and
// requires an identifying User-Agent — enforced here with a fixed delay
// after every live lookup (not after a cache hit).
async function geocodePlace(name) {
  const key = name.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const cachePath = path.join(SCRATCH_DIR, "geocode_cache.json");
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({ q: name, countrycodes: "se", format: "json", limit: "1" }).toString();
  let result = null;
  try {
    const text = execFileSync(
      "curl",
      ["-s", "-m", "20", "-H", "User-Agent: geo-quizzes-databuild/1.0 (Swedish roads game data prep)", url],
      { encoding: "utf8" }
    );
    const results = JSON.parse(text);
    if (results[0]) result = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch (err) {
    console.warn(`  geocode failed for "${name}": ${err.message?.slice(0, 150)}`);
  }
  geocodeCache.set(key, result);
  fs.writeFileSync(cachePath, JSON.stringify([...geocodeCache.entries()]));
  await sleep(1100);
  return result;
}

async function loadGeocodeCache() {
  const cachePath = path.join(SCRATCH_DIR, "geocode_cache.json");
  if (!fs.existsSync(cachePath)) return;
  for (const [k, v] of JSON.parse(fs.readFileSync(cachePath, "utf8"))) geocodeCache.set(k, v);
}

// Returns the feature's geometry (possibly clipped) plus the coordinates to
// store as fromLat/fromLng/toLat/toLng.
async function assignEndpointCoordsAndClip(feature) {
  const fromGeo = await geocodePlace(feature.properties.fromPlace);
  const toGeo = await geocodePlace(feature.properties.toPlace);
  if (fromGeo && toGeo) {
    const clipped = clipGeometry(feature.geometry, fromGeo, toGeo);
    if (clipped) {
      return {
        geometry: clipped.geometry,
        fromLat: clipped.fromPoint[1],
        fromLng: clipped.fromPoint[0],
        toLat: clipped.toPoint[1],
        toLng: clipped.toPoint[0],
      };
    }
  }

  // Exactly one side resolved — confirmed to happen for ~20/277 roads, almost
  // all of them a border description ("norska gränsen"/"finska gränsen") that
  // isn't a real geocodable place, not a data-quality fluke. Getting
  // directionality right still matters here: anchor the resolved side to its
  // true nearest point on the line, and anchor the unresolved side to
  // whichever geometry extremity is FARTHEST from that point. An arbitrary
  // array-order pick here (the previous version of this fallback) reintroduces
  // exactly the swapped-labels bug this whole function exists to fix, just
  // for this subset of roads instead of all of them.
  const knownGeo = fromGeo || toGeo;
  if (knownGeo) {
    const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const hit = nearestOnLines(lines, knownGeo.lng, knownGeo.lat);
    if (hit) {
      const candidates = lines.flatMap((line) => [line[0], line[line.length - 1]]);
      let far = candidates[0];
      let farDist = -1;
      for (const c of candidates) {
        const d = sqDist(hit.coord[0], hit.coord[1], c);
        if (d > farDist) {
          farDist = d;
          far = c;
        }
      }
      return fromGeo
        ? { geometry: feature.geometry, fromLat: hit.coord[1], fromLng: hit.coord[0], toLat: far[1], toLng: far[0] }
        : { geometry: feature.geometry, fromLat: far[1], fromLng: far[0], toLat: hit.coord[1], toLng: hit.coord[0] };
    }
  }

  // Neither side geocoded (or nearestOnLines somehow found nothing) —
  // nothing to anchor to; keep the old raw-extremity fallback rather than
  // dropping the road.
  const [p1, p2] = geographicExtremes(feature.geometry);
  return { geometry: feature.geometry, fromLat: p1[1], fromLng: p1[0], toLat: p2[1], toLng: p2[0] };
}

async function fetchGeometries(matched) {
  const allIds = [...new Set(matched.flatMap((m) => m.relationIds))];
  const CHUNK = 60;
  const waysByRelation = new Map();
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const chunk = allIds.slice(i, i + CHUNK);
    console.log(`  fetching geometry for relations ${i + 1}-${i + chunk.length} of ${allIds.length}...`);
    const cachePath = path.join(SCRATCH_DIR, `geom_chunk_${i}.json`);
    let elements;
    if (fs.existsSync(cachePath)) {
      elements = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      const query = `[out:json][timeout:180];rel(id:${chunk.join(",")});out geom;`;
      elements = await overpass(query);
      fs.writeFileSync(cachePath, JSON.stringify(elements));
      await sleep(2000);
    }
    for (const el of elements) {
      if (el.type !== "relation") continue;
      const ways = (el.members || []).filter((m) => m.type === "way" && m.geometry);
      waysByRelation.set(el.id, ways);
    }
  }

  const features = [];
  const geometryFailures = [];
  for (const road of matched) {
    const ways = road.relationIds.flatMap((id) => waysByRelation.get(id) || []);
    const geometry = assembleGeometry(ways);
    if (!geometry) {
      geometryFailures.push(road.roadType + " " + road.designation);
      continue;
    }
    features.push({
      type: "Feature",
      properties: {
        name: road.designation,
        designation: road.designation,
        roadType: road.roadType,
        fromPlace: road.fromPlace,
        toPlace: road.toPlace,
      },
      geometry,
    });
  }
  return { features, geometryFailures };
}

// --- Step 4: simplify + write scratch output -----------------------------

function simplifyFeature(feature) {
  const tolerance = 0.001;
  const simplified = simplify(
    { type: "Feature", properties: {}, geometry: feature.geometry },
    { tolerance, highQuality: false }
  );
  return { ...feature, geometry: simplified.geometry };
}

async function main() {
  console.log("Fetching Wikipedia road list...");
  const roads = await fetchWikiRoadList();
  console.log(`  parsed ${roads.length} roads (motorway/riksvag/lansvag)`);

  console.log("Matching to OSM route relations...");
  const { matched, unmatched } = await matchRelations(roads);
  console.log(`  matched ${matched.length}/${roads.length}`);
  if (unmatched.length) {
    console.log("  UNMATCHED (no OSM route relation found):", JSON.stringify(unmatched));
  }

  console.log("Fetching geometry...");
  const { features, geometryFailures } = await fetchGeometries(matched);
  console.log(`  built geometry for ${features.length}/${matched.length}`);
  if (geometryFailures.length) {
    console.log("  GEOMETRY FAILURES (matched but no usable way geometry):", JSON.stringify(geometryFailures));
  }

  // Geocode + clip BEFORE simplifying: clipping needs the full-resolution
  // geometry to find the true nearest point to each named place (a
  // simplified line may have already dropped that exact point), and
  // simplifying the shorter, already-clipped line afterward is cheaper too.
  console.log("Geocoding endpoint place names + clipping geometry (rate-limited to ~1/sec, cached)...");
  await loadGeocodeCache();
  const withCoords = [];
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const { geometry, ...coords } = await assignEndpointCoordsAndClip(feature);
    withCoords.push({ ...feature, geometry, properties: { ...feature.properties, ...coords } });
    if ((i + 1) % 25 === 0) console.log(`  geocoded ${i + 1}/${features.length}...`);
  }

  console.log("Simplifying...");
  const simplified = withCoords.map(simplifyFeature);

  const outPath = path.join(SCRATCH_DIR, "swedish_roads_primary.json");
  fs.writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features: simplified }));
  console.log(`Wrote ${simplified.length} features to ${outPath}`);

  const counts = {};
  for (const f of simplified) counts[f.properties.roadType] = (counts[f.properties.roadType] || 0) + 1;
  console.log("By type:", counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
