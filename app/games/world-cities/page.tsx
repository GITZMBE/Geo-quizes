"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getGame } from "@/lib/games/registry";
import { fetchWorldCities, type WorldCity } from "@/lib/games/data";

// This mode component uses browser-only APIs (globe.gl) and is behind
// login with no SEO value, so there's nothing gained from prerendering it.
const WorldProximityMode = dynamic(
  () => import("./WorldProximityMode").then((m) => m.WorldProximityMode),
  { ssr: false }
);

const game = getGame("world-cities")!;

export default function WorldCitiesPage() {
  const [cities, setCities] = useState<WorldCity[] | null>(null);

  useEffect(() => {
    fetchWorldCities(game.dataFile).then(setCities);
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">{game.name}</h1>
      <p className="text-muted-foreground">{game.description}</p>

      {!cities ? (
        <p className="text-muted-foreground">Loading cities...</p>
      ) : (
        <WorldProximityMode cities={cities} />
      )}
    </main>
  );
}
