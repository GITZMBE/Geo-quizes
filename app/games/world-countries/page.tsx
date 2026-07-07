"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getGame } from "@/lib/games/registry";
import { fetchWorldCountries, type WorldCountry } from "@/lib/games/data";

// Client-only: no map/globe here, but kept consistent with every other
// game's ssr:false pattern since it sits behind login with no SEO value.
const TypeAllMode = dynamic(() => import("./TypeAllMode").then((m) => m.TypeAllMode), {
  ssr: false,
});

const game = getGame("world-countries")!;

export default function WorldCountriesPage() {
  const [countries, setCountries] = useState<WorldCountry[] | null>(null);

  useEffect(() => {
    fetchWorldCountries(game.dataFile).then(setCountries);
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">{game.name}</h1>
      <p className="text-muted-foreground">{game.description}</p>

      {!countries ? (
        <p className="text-muted-foreground">Loading countries...</p>
      ) : (
        <TypeAllMode countries={countries} />
      )}
    </main>
  );
}
