// Rebuilds public/data/us_states.json from geoBoundaries' USA ADM1 (state)
// boundaries — public domain, https://www.geoboundaries.org/api/current/gbOpen/USA/ADM1/
// (that endpoint returns metadata including a simplifiedGeometryGeoJSON
// download link; fetch it fresh if geoBoundaries publishes a new release).
//
// Requires @turf/simplify + @turf/area, not project dependencies since this
// only runs offline as a data-prep step:
//   npm install --no-save @turf/simplify @turf/area
//
// Source file (not checked in — download fresh if rerunning):
//   https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/USA/ADM1/geoBoundaries-USA-ADM1_simplified.geojson
const fs = require("fs");
const simplify = require("@turf/simplify").default;
const area = require("@turf/area").default;

// geoBoundaries' ADM1 set for the USA also includes DC and five
// territories (Puerto Rico, Guam, American Samoa, N. Mariana Islands, US
// Virgin Islands) alongside the 50 actual states — drop those for a
// "US states" game.
const EXCLUDE = new Set([
  "District of Columbia",
  "Puerto Rico",
  "Guam",
  "American Samoa",
  "Commonwealth of the Northern Mariana Islands",
  "United States Virgin Islands",
]);

const raw = JSON.parse(
  fs.readFileSync("us-states-simplified.geojson", "utf8")
);
const states = raw.features.filter((f) => !EXCLUDE.has(f.properties.shapeName));

// Drop tiny outlying islands (mostly Alaska's Aleutian chain — 586 separate
// rings before this filter) that don't meaningfully change a state's
// clickable shape but multiply the number of separate polygon meshes
// three-globe has to build: 1409 rings across all 50 states made the globe
// take 30s+ to render. Keep any ring whose area is at least 0.5% of that
// state's largest ring (e.g. Hawaii keeps its 8 main islands, Alaska keeps
// the mainland + its two largest islands).
function dropTinyRings(geometry) {
  if (geometry.type === "Polygon") return geometry;
  const polysWithArea = geometry.coordinates.map((poly) => ({
    poly,
    area: area({ type: "Polygon", coordinates: poly }),
  }));
  const maxArea = Math.max(...polysWithArea.map((p) => p.area));
  const kept = polysWithArea
    .filter((p) => p.area >= maxArea * 0.005)
    .map((p) => p.poly);
  return kept.length === 1
    ? { type: "Polygon", coordinates: kept[0] }
    : { type: "MultiPolygon", coordinates: kept };
}

const simplified = states.map((f) => {
  const s = simplify(
    { type: "Feature", properties: {}, geometry: f.geometry },
    { tolerance: 0.01, highQuality: false }
  );
  return {
    type: "Feature",
    properties: { name: f.properties.shapeName },
    geometry: dropTinyRings(s.geometry),
  };
});

const out = { type: "FeatureCollection", features: simplified };
fs.writeFileSync("public/data/us_states.json", JSON.stringify(out));
console.log("wrote", simplified.length, "states");
