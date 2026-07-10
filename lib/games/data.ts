// Two canonical on-disk formats for game data (see .claude/skills/new-game/SKILL.md):
//  - "polygons": a standard GeoJSON FeatureCollection, `properties.name` per feature.
//  - "points": { kind: "points", items: [{ id, name, lat, lng, ...extra }] }.

export type RegionFeature = {
  type: "Feature";
  properties: { name: string };
  geometry: { type: string; coordinates: unknown };
};

export type RegionCollection = {
  type: "FeatureCollection";
  features: RegionFeature[];
};

export async function fetchRegions(url: string): Promise<RegionFeature[]> {
  const res = await fetch(url);
  const data: RegionCollection = await res.json();
  return data.features;
}

// Aliases for the Stockholm districts game.
export type DistrictFeature = RegionFeature;
export type DistrictCollection = RegionCollection;
export const fetchDistricts = fetchRegions;

export type GamePoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export async function fetchPoints<T extends GamePoint>(url: string): Promise<T[]> {
  const res = await fetch(url);
  const data: { items: T[] } = await res.json();
  return data.items;
}

export type City = GamePoint & {
  rank: number;
  population: number;
};

export async function fetchCities(url: string): Promise<City[]> {
  return fetchPoints<City>(url);
}

export type WorldCity = GamePoint & {
  rank: number;
  population: number;
  country: string;
};

export async function fetchWorldCities(url: string): Promise<WorldCity[]> {
  return fetchPoints<WorldCity>(url);
}

export type WorldCountry = GamePoint & {
  rank: number;
  continent: string;
  capital: string;
  flagUrl: string;
};

export async function fetchWorldCountries(url: string): Promise<WorldCountry[]> {
  return fetchPoints<WorldCountry>(url);
}

export type CountryFeature = RegionFeature & {
  properties: { name: string; iso2: string; capital: string; flagUrl: string };
};

// Same wire format as fetchRegions (plain GeoJSON) — CountryFeature only
// adds extra properties fields, so this just re-fetches and widens the type
// rather than reimplementing the fetch.
export async function fetchCountryRegions(url: string): Promise<CountryFeature[]> {
  const features = await fetchRegions(url);
  return features as CountryFeature[];
}

export type RoadType = "motorway" | "riksvag" | "lansvag";

// A road is the first LineString/MultiLineString geometry in this codebase —
// still plain GeoJSON (no new envelope), so it reuses fetchRegions exactly
// like CountryFeature above. `properties.name` is set equal to `designation`
// at data-build time so RoadFeature satisfies RegionFeature's `{name}` shape
// and every existing getId/label convention (e.g. useRoundGame's
// `getId: r => r.properties.name`) works unmodified. `roadType` is
// "lansvag" for both primary (100-499, nationally unique) and secondary
// (500-2999, county-letter-prefixed in `designation` to stay unique) county
// roads — the distinction lives in `designation`'s shape, not a separate type.
export type RoadFeature = RegionFeature & {
  properties: {
    name: string;
    designation: string;
    roadType: RoadType;
    fromPlace: string;
    toPlace: string;
    // The actual geometry endpoint each place name corresponds to, fixed at
    // data-build time (see scripts/build-swedish-roads-{primary,secondary}.js).
    // A road's geometry is assembled from possibly-multiple OSM way/relation
    // segments, so "first/last coordinate of the geometry" isn't reliably
    // fromPlace/toPlace's real-world location — deriving it from compass
    // direction at render time was tried and was wrong for any road that
    // doesn't happen to run southwest-to-northeast. These are computed once
    // by geocoding fromPlace/toPlace and matching each to its nearer
    // geometry extremity, so rendering never has to guess.
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
  };
  geometry: { type: "LineString" | "MultiLineString"; coordinates: unknown };
};

export async function fetchRoads(url: string): Promise<RoadFeature[]> {
  const features = await fetchRegions(url);
  return features as RoadFeature[];
}
