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
];

export function getGame(slug: string): GameDefinition | undefined {
  return GAMES.find((g) => g.slug === slug);
}
