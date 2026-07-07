export type GameMode = {
  slug: string;
  name: string;
  scoreType: "POINTS" | "TIME_MS";
};

export type GameDefinition = {
  slug: string;
  name: string;
  description: string;
  dataFile: string;
  modes: GameMode[];
};

export const GAMES: GameDefinition[] = [
  {
    slug: "stockholm-stadsdelar",
    name: "Stockholm Districts",
    description:
      "A district is named — click its outline on the map of Stockholm.",
    dataFile: "/data/stockholm_stadsdelar.json",
    modes: [{ slug: "click-district", name: "Click the district", scoreType: "POINTS" }],
  },
  {
    slug: "sweden-cities",
    name: "Sweden's Biggest Cities",
    description:
      "Name, locate, or guess the location of Sweden's top 100 largest cities.",
    dataFile: "/data/sweden_largest_cities.json",
    modes: [
      { slug: "type-all", name: "Type them all", scoreType: "TIME_MS" },
      { slug: "click-dot", name: "Click the city", scoreType: "POINTS" },
      { slug: "proximity", name: "Guess the location", scoreType: "POINTS" },
    ],
  },
  {
    slug: "world-cities",
    name: "Five Cities Across the World",
    description:
      "Five of the world's biggest cities, one at a time — click where on the globe you think each one is.",
    dataFile: "/data/world_largest_cities.json",
    modes: [{ slug: "proximity", name: "Guess the location", scoreType: "POINTS" }],
  },
  {
    slug: "us-states",
    name: "US States",
    description: "A state is named — click its outline on the map.",
    dataFile: "/data/us_states.json",
    modes: [{ slug: "click-state", name: "Click the state", scoreType: "POINTS" }],
  },
  {
    slug: "world-countries",
    name: "List All Countries",
    description: "Type the name of every country in the world.",
    dataFile: "/data/world_countries.json",
    modes: [{ slug: "type-all", name: "Type them all", scoreType: "TIME_MS" }],
  },
  {
    slug: "countries-africa",
    name: "Countries of Africa",
    description: "Learn Africa's countries, capitals, and flags.",
    dataFile: "/data/countries_africa.json",
    modes: [
      { slug: "countries", name: "Countries", scoreType: "POINTS" },
      { slug: "capitals", name: "Capitals", scoreType: "POINTS" },
      { slug: "flags", name: "Flags", scoreType: "POINTS" },
    ],
  },
  {
    slug: "countries-asia",
    name: "Countries of Asia",
    description: "Learn Asia's countries, capitals, and flags.",
    dataFile: "/data/countries_asia.json",
    modes: [
      { slug: "countries", name: "Countries", scoreType: "POINTS" },
      { slug: "capitals", name: "Capitals", scoreType: "POINTS" },
      { slug: "flags", name: "Flags", scoreType: "POINTS" },
    ],
  },
  {
    slug: "countries-europe",
    name: "Countries of Europe",
    description: "Learn Europe's countries, capitals, and flags.",
    dataFile: "/data/countries_europe.json",
    modes: [
      { slug: "countries", name: "Countries", scoreType: "POINTS" },
      { slug: "capitals", name: "Capitals", scoreType: "POINTS" },
      { slug: "flags", name: "Flags", scoreType: "POINTS" },
    ],
  },
  {
    slug: "countries-north-america",
    name: "Countries of North America",
    description: "Learn North America's countries, capitals, and flags.",
    dataFile: "/data/countries_north-america.json",
    modes: [
      { slug: "countries", name: "Countries", scoreType: "POINTS" },
      { slug: "capitals", name: "Capitals", scoreType: "POINTS" },
      { slug: "flags", name: "Flags", scoreType: "POINTS" },
    ],
  },
  {
    slug: "countries-south-america",
    name: "Countries of South America",
    description: "Learn South America's countries, capitals, and flags.",
    dataFile: "/data/countries_south-america.json",
    modes: [
      { slug: "countries", name: "Countries", scoreType: "POINTS" },
      { slug: "capitals", name: "Capitals", scoreType: "POINTS" },
      { slug: "flags", name: "Flags", scoreType: "POINTS" },
    ],
  },
  {
    slug: "countries-oceania",
    name: "Countries of Oceania",
    description: "Learn Oceania's countries, capitals, and flags.",
    dataFile: "/data/countries_oceania.json",
    modes: [
      { slug: "countries", name: "Countries", scoreType: "POINTS" },
      { slug: "capitals", name: "Capitals", scoreType: "POINTS" },
      { slug: "flags", name: "Flags", scoreType: "POINTS" },
    ],
  },
];

export function getGame(slug: string): GameDefinition | undefined {
  return GAMES.find((g) => g.slug === slug);
}
