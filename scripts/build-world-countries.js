// Rebuilds public/data/world_countries.json and public/data/countries_<continent>.json
// from three public sources:
//   - Natural Earth 1:50m Admin-0 Countries (public domain) for borders + continent
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
//   - GeoNames countryInfo.txt for capitals
//     https://download.geonames.org/export/dump/countryInfo.txt
//   - flagcdn.com for flag images (referenced by URL, not downloaded)
//
// Requires @turf/simplify, @turf/area, @turf/point-on-feature, @turf/bbox-clip,
// not project dependencies since this only runs offline as a data-prep step:
//   npm install --no-save @turf/simplify @turf/area @turf/point-on-feature @turf/bbox-clip
//
// Source files (not checked in — download fresh if rerunning):
//   ne_50m_admin_0_countries.geojson, countryInfo.txt (both in cwd)
const fs = require("fs");
const simplify = require("@turf/simplify").default;
const area = require("@turf/area").default;
const pointOnFeature = require("@turf/point-on-feature").default;
const bboxClip = require("@turf/bbox-clip").default;

// Natural Earth's admin-0 set includes non-sovereign dependencies and a
// handful of disputed/indeterminate territories alongside real countries.
const EXCLUDE_TYPES = new Set(["Dependency"]);
const EXCLUDE_NAMES = new Set([
  "Antarctica", "Fr. S. Antarctic Lands", // not a country
  "W. Sahara", "Siachen Glacier", // disputed, no stable ISO/capital consensus
  "Falkland Is.", "Br. Indian Ocean Ter.", // UK territories
  "Jersey", "Guernsey", "Isle of Man", // British Crown Dependencies
  "Aruba", "Curaçao", "Sint Maarten", // constituent countries of the Netherlands
  "Åland", // autonomous region of Finland
  "Greenland", // autonomous territory of Denmark
  "Macao", "Hong Kong", // SARs of China
  "N. Cyprus", "Somaliland", // no assigned ISO 3166-1 code
]);
// Natural Earth's NAME field is tuned for map-label space, not prose —
// expand the ones that read as abbreviations rather than common usage.
const NAME_OVERRIDES = {
  "Marshall Is.": "Marshall Islands",
  "S. Sudan": "South Sudan",
  "Solomon Is.": "Solomon Islands",
  "St. Vin. and Gren.": "Saint Vincent and the Grenadines",
  "Eq. Guinea": "Equatorial Guinea",
  "Dominican Rep.": "Dominican Republic",
  "Dem. Rep. Congo": "Democratic Republic of the Congo",
  "Central African Rep.": "Central African Republic",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Antigua and Barb.": "Antigua and Barbuda",
  "Congo": "Republic of the Congo", // disambiguate from Dem. Rep. Congo
  "United States of America": "United States",
};
// Natural Earth tags small Indian Ocean island nations "Seven seas (open
// ocean)" instead of a real continent — reassign to the continent they're
// actually taught as part of.
const CONTINENT_OVERRIDES = { Seychelles: "Africa", Mauritius: "Africa", Maldives: "Asia" };

const CONTINENT_SLUGS = {
  Africa: "africa",
  Asia: "asia",
  Europe: "europe",
  "North America": "north-america",
  "South America": "south-america",
  Oceania: "oceania",
};

const countryInfoLines = fs
  .readFileSync("countryInfo.txt", "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
const geonamesByIso2 = new Map();
for (const line of countryInfoLines) {
  const cols = line.split("\t");
  geonamesByIso2.set(cols[0], { capital: cols[5] });
}

const raw = JSON.parse(fs.readFileSync("ne_50m_admin_0_countries.geojson", "utf8"));

const dropped = [];
const countries = [];
for (const f of raw.features) {
  const p = f.properties;
  if (EXCLUDE_TYPES.has(p.TYPE) || EXCLUDE_NAMES.has(p.NAME)) continue;

  // ISO_A2_EH ("de-facto") resolves several disputed territories (Kosovo,
  // Norway, France) that plain ISO_A2 leaves as "-99" on this dataset.
  const iso2 = p.ISO_A2_EH && p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : p.ISO_A2;
  if (!iso2 || iso2 === "-99") {
    dropped.push(p.NAME + " (no ISO code)");
    continue;
  }
  const geo = geonamesByIso2.get(iso2);
  if (!geo || !geo.capital) {
    dropped.push(`${p.NAME} (${iso2}) (no GeoNames capital entry)`);
    continue;
  }

  const name = NAME_OVERRIDES[p.NAME] || p.NAME;
  countries.push({
    name,
    iso2,
    continent: CONTINENT_OVERRIDES[name] || p.CONTINENT,
    capital: geo.capital,
    geometry: f.geometry,
  });
}

// Drop tiny outlying islands/rings (mostly archipelago nations and countries
// with far-flung territories) that multiply separate polygon parts without
// meaningfully changing a country's clickable shape — same technique used
// for US States (see scripts/build-us-states.js), which cut Alaska from
// 586 rings to 3 and fixed a 30s+ scene-build time. Also drops any ring
// reaching past +-80° latitude: the Mercator projection MapView renders
// these with is fundamentally unbounded toward the poles (this is why real
// web maps universally cap at ~85.05°N/S), and in practice d3-geo renders
// at least one real, non-self-intersecting, high-Arctic ring (Canada's
// Ellesmere Island, reaching 82.5°N) as an unfilled hole after Mercator
// projection — not a data problem (turf/kinks found zero self-intersections
// pre-projection), a projection-library edge case not worth chasing further
// for one remote, largely uninhabited island.
function dropTinyRings(geometry) {
  if (geometry.type === "Polygon") return geometry;
  const polysWithArea = geometry.coordinates.map((poly) => {
    let maxLat = -Infinity;
    for (const [, lat] of poly[0]) if (lat > maxLat) maxLat = lat;
    let minLat = Infinity;
    for (const [, lat] of poly[0]) if (lat < minLat) minLat = lat;
    return { poly, area: area({ type: "Polygon", coordinates: poly }), maxLat, minLat };
  });
  const maxArea = Math.max(...polysWithArea.map((p) => p.area));
  const kept = polysWithArea
    .filter((p) => p.area >= maxArea * 0.01 && p.maxLat < 80 && p.minLat > -80)
    .map((p) => p.poly);
  return kept.length === 1
    ? { type: "Polygon", coordinates: kept[0] }
    : { type: "MultiPolygon", coordinates: kept };
}

// Russia is transcontinental but classified Europe here (as most atlases
// do, for its capital/flag) — its Asian extent reaching to the Pacific
// dwarfs every other European country and dominates the Europe map's
// fitSize bounding box, squeezing Western/Central Europe into unclickable
// slivers. Clip to west of the Urals (the traditional Europe/Asia
// boundary, ~60°E) for the map specifically; capital/flag are unaffected
// since those don't depend on the polygon extent.
function clipToEuropeanRussia(geometry) {
  const clipped = bboxClip({ type: "Feature", properties: {}, geometry }, [19, 41, 60, 82]);
  return clipped.geometry;
}

const processed = countries.map((c) => {
  const simplified = simplify(
    { type: "Feature", properties: {}, geometry: c.geometry },
    { tolerance: 0.02, highQuality: false }
  );
  let geometry = dropTinyRings(simplified.geometry);
  if (c.name === "Russia") geometry = clipToEuropeanRussia(geometry);
  const flagUrl = `https://flagcdn.com/w320/${c.iso2.toLowerCase()}.png`;
  return { ...c, geometry, flagUrl };
});

// Representative point (guaranteed to fall ON the country's own surface,
// unlike a plain centroid which can land outside for archipelagos/concave
// shapes) for the world-countries points-format game.
const worldPoints = {
  kind: "points",
  source:
    "Natural Earth 1:50m Admin-0 Countries (public domain) for borders/continent, GeoNames countryInfo.txt for capitals, flagcdn.com for flag images.",
  note: `${processed.length} sovereign states with a usable ISO 3166-1 code and GeoNames capital entry. Excludes dependencies/territories (Puerto Rico, Greenland, Hong Kong, etc.), Antarctica, and two disputed territories with no assigned ISO code (Somaliland, Northern Cyprus). Dropped: ${dropped.join("; ") || "none"}.`,
  items: [...processed]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c, i) => {
      const pt = pointOnFeature({ type: "Feature", properties: {}, geometry: c.geometry });
      const [lng, lat] = pt.geometry.coordinates;
      return {
        id: c.iso2,
        rank: i + 1,
        name: c.name,
        lat,
        lng,
        continent: c.continent,
        capital: c.capital,
        flagUrl: c.flagUrl,
      };
    }),
};
fs.writeFileSync("public/data/world_countries.json", JSON.stringify(worldPoints));

for (const [continentName, slug] of Object.entries(CONTINENT_SLUGS)) {
  const features = processed
    .filter((c) => c.continent === continentName)
    .map((c) => ({
      type: "Feature",
      properties: { name: c.name, iso2: c.iso2, capital: c.capital, flagUrl: c.flagUrl },
      geometry: c.geometry,
    }));
  fs.writeFileSync(
    `public/data/countries_${slug}.json`,
    JSON.stringify({ type: "FeatureCollection", features })
  );
  console.log(continentName, ":", features.length, "countries");
}

console.log("total countries:", processed.length, "dropped:", dropped.length);
