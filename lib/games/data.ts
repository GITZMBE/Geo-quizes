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
