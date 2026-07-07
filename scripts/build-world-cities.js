// Rebuilds public/data/world_largest_cities.json from GeoNames' worldwide
// cities dump. Source files (not checked in — download fresh if rerunning):
//   https://download.geonames.org/export/dump/cities15000.zip  -> cities15000.txt
//   https://download.geonames.org/export/dump/countryInfo.txt
// Run from the repo root with both files in the current directory.
const fs = require("fs");

const countryLines = fs
  .readFileSync("countryInfo.txt", "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
const countryByIso = new Map();
for (const line of countryLines) {
  const cols = line.split("\t");
  const iso = cols[0];
  const name = cols[4];
  if (iso && name) countryByIso.set(iso, name);
}

const raw = fs.readFileSync("cities15000.txt", "utf8");
const rows = raw.split("\n").filter(Boolean);

const cities = [];
for (const row of rows) {
  const cols = row.split("\t");
  const [
    geonameid,
    name,
    asciiname,
    ,
    latitude,
    longitude,
    featureClass,
    ,
    countryCode,
    ,
    ,
    ,
    ,
    ,
    population,
  ] = cols;
  if (featureClass !== "P") continue;
  const pop = parseInt(population, 10) || 0;
  if (pop <= 0) continue;
  cities.push({
    geonameid,
    name: asciiname || name,
    lat: parseFloat(latitude),
    lng: parseFloat(longitude),
    population: pop,
    country: countryByIso.get(countryCode) || countryCode,
  });
}

cities.sort((a, b) => b.population - a.population);

// Dedupe cities that share the exact same (name, country) pair, keeping the
// higher-population entry (GeoNames sometimes lists a city and a
// sub-district/borough with identical names).
const seen = new Set();
const deduped = [];
for (const c of cities) {
  const key = `${c.name}|${c.country}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(c);
}

const TOP_N = 120;
const top = deduped.slice(0, TOP_N).map((c, i) => ({
  id: c.geonameid,
  rank: i + 1,
  name: c.name,
  country: c.country,
  lat: c.lat,
  lng: c.lng,
  population: c.population,
}));

const out = {
  kind: "points",
  source:
    "GeoNames cities15000 dump (download.geonames.org/export/dump/cities15000.zip), filtered to feature class P and sorted by population descending.",
  note: `Top ${TOP_N} most populous cities worldwide by GeoNames population figures.`,
  items: top,
};

fs.writeFileSync(
  "public/data/world_largest_cities.json",
  JSON.stringify(out, null, 2)
);
console.log("wrote", top.length, "cities");
