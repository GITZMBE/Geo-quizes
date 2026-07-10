// One-off post-processing pass: trims every road's LineString/
// MultiLineString geometry in public/data/swedish_roads.json down to only
// the portion(s) that actually fall within Sweden's border — independent
// of (and stricter than) the existing named-endpoint clipping in
// scripts/build-swedish-roads-primary.js, which trims to the point nearest
// a geocoded place name (usually right at the border, but not guaranteed
// to be exactly on it, and doesn't help at all for the internal Swedish
// stretch of an international relation that dips briefly out of the
// country and back, e.g. via a lake or a border town's street grid).
//
// Uses a real 10m-resolution country boundary (Natural Earth
// ne_10m_admin_0_countries, refetched fresh into .scratch-swedish-roads/ —
// NOT the coarser Sweden polygon already in public/data/countries_europe.json,
// which is simplified with @turf/simplify tolerance 0.02 for a clickable
// country map and was confirmed during development to misclassify real
// coastal points as outside Sweden — e.g. Stockholm and Helsingborg
// themselves land ~0.2-0.9km outside that simplified ring).
//
// Requires (installed --no-save, data-prep only):
//   npm install --no-save @turf/boolean-point-in-polygon @turf/helpers
//   @turf/line-intersect @turf/polygon-to-line @turf/kinks
const fs = require("fs");
const path = require("path");
const pointInPolygon = require("@turf/boolean-point-in-polygon").default;
const lineIntersect = require("@turf/line-intersect").default;
const polygonToLine = require("@turf/polygon-to-line").default;
const { point, lineString, multiLineString, featureCollection } = require("@turf/helpers");

const DATA_PATH = path.join(__dirname, "..", "public", "data", "swedish_roads.json");
const SWEDEN_PATH = path.join(__dirname, "..", ".scratch-swedish-roads", "sweden_ne10m.json");

const sweden = JSON.parse(fs.readFileSync(SWEDEN_PATH, "utf8"));
// Sweden's boundary as lines (for finding exact border-crossing points),
// flattened to one array of [lng,lat] segments-as-linestrings turf can
// intersect against.
const swedenBoundaryLines = polygonToLine(sweden);
const boundaryFeatures =
  swedenBoundaryLines.type === "FeatureCollection" ? swedenBoundaryLines.features : [swedenBoundaryLines];

function isInside(pt) {
  return pointInPolygon(point(pt), sweden);
}

// Exact crossing point of segment [a,b] against Sweden's border, picking
// whichever candidate (there can be more than one very close together at a
// jagged coastline) is nearest to `a` — correct as long as the segment
// doesn't cross the border back and forth multiple times within itself,
// which a single road-geometry edge (already fairly fine-grained, pre-
// simplification at this stage) essentially never does.
function findCrossing(a, b, fallback) {
  const seg = lineString([a, b]);
  let best = null;
  let bestDist = Infinity;
  for (const bf of boundaryFeatures) {
    const hits = lineIntersect(seg, bf);
    for (const hit of hits.features) {
      const p = hit.geometry.coordinates;
      const d = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  return best ?? fallback;
}

// Splits one line's coordinates into the sub-runs that are inside Sweden,
// inserting the exact border-crossing point at each transition instead of
// just dropping the outside points outright (so the clipped line still
// ends precisely at the border rather than at the last interior sample
// point, which could be a visible km or more short of it depending on
// point spacing).
function clipLine(coords) {
  const segments = [];
  let current = [];
  let prevInside = null;
  let prevPt = null;
  for (const pt of coords) {
    const inside = isInside(pt);
    if (prevPt && inside !== prevInside) {
      const crossing = findCrossing(prevPt, pt, inside ? pt : prevPt);
      current.push(crossing);
      if (!inside) {
        if (current.length >= 2) segments.push(current);
        current = [];
      } else {
        current = [crossing];
      }
    }
    if (inside) current.push(pt);
    prevInside = inside;
    prevPt = pt;
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function clipGeometry(geometry) {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const clipped = lines.flatMap(clipLine);
  return clipped;
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
let changedCount = 0;
let droppedPointsTotal = 0;
// A road with zero geometry inside Sweden isn't "unclipped" — its upstream
// chain-selection (build-swedish-roads-primary.js) picked entirely the
// wrong OSM relation segment(s), most often for a road with one
// ungeocodable border-name endpoint ("norska gränsen"/"finska gränsen").
// Leaving the original (wrong) geometry in would show a real-looking but
// factually incorrect road to players; better to drop the road from the
// pool entirely than mislead. Confirmed cases: E18 (chain-selection landed
// entirely on the Finland/Russia side of its international relation, not
// the Swedish Karlstad-Kapellskär stretch) and E265 (a degenerate 2-point
// stub — its OSM relation has essentially no Swedish-side geometry, it's
// almost entirely a Tallinn ferry connection).
const droppedRoads = [];

data.features = data.features.filter((feature) => {
  const beforePoints = (feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates).reduce(
    (s, l) => s + l.length,
    0
  );

  const clippedLines = clipGeometry(feature.geometry);
  const afterPoints = clippedLines.reduce((s, l) => s + l.length, 0);

  if (clippedLines.length === 0) {
    droppedRoads.push(feature.properties.designation);
    return false; // drop entirely — see comment above on why, not left unclipped
  }

  if (afterPoints !== beforePoints) {
    changedCount++;
    droppedPointsTotal += beforePoints - afterPoints;
  }

  feature.geometry =
    clippedLines.length === 1
      ? { type: "LineString", coordinates: clippedLines[0] }
      : { type: "MultiLineString", coordinates: clippedLines };

  // The client (RoadsMode.tsx) reads fromLat/fromLng/toLat/toLng directly
  // as marker positions rather than deriving them from geometry — those
  // must be kept in sync with whatever the actual first/last point of the
  // (now possibly-shorter) geometry is, or a marker could end up floating
  // off the end of the trimmed line. This matters most for exactly the
  // roads this script targets: an ungeocodable border-name endpoint (e.g.
  // "norska gränsen") whose stored fromLat/fromLng may have been outside
  // Sweden to begin with, in which case this also corrects the marker
  // itself, not just the line.
  const first = clippedLines[0][0];
  const last = clippedLines[clippedLines.length - 1][clippedLines[clippedLines.length - 1].length - 1];
  feature.properties.fromLng = first[0];
  feature.properties.fromLat = first[1];
  feature.properties.toLng = last[0];
  feature.properties.toLat = last[1];
  return true;
});

fs.writeFileSync(DATA_PATH, JSON.stringify(data));
console.log(`Roads with geometry changed: ${changedCount} / ${data.features.length}`);
console.log(`Total points removed (outside Sweden): ${droppedPointsTotal}`);
if (droppedRoads.length) {
  console.log(`Dropped ${droppedRoads.length} road(s) entirely (no in-Sweden geometry at all):`, droppedRoads);
}
