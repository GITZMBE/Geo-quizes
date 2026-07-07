"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getGame } from "@/lib/games/registry";
import { fetchCountryRegions, type CountryFeature } from "@/lib/games/data";

// These mode components use browser-only APIs (an SVG map, or none at all)
// and are behind login with no SEO value, so there's nothing gained from
// prerendering them.
const CountriesMapMode = dynamic(
  () => import("@/components/games/CountriesMapMode").then((m) => m.CountriesMapMode),
  { ssr: false }
);
const CapitalsMode = dynamic(
  () => import("@/components/games/CapitalsMode").then((m) => m.CapitalsMode),
  { ssr: false }
);
const FlagsMode = dynamic(
  () => import("@/components/games/FlagsMode").then((m) => m.FlagsMode),
  { ssr: false }
);

const game = getGame("countries-africa")!;

export default function CountriesAfricaPage() {
  const [mode, setMode] = useState(game.modes[0].slug);
  const [countries, setCountries] = useState<CountryFeature[] | null>(null);

  useEffect(() => {
    fetchCountryRegions(game.dataFile).then(setCountries);
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">{game.name}</h1>
      <p className="text-muted-foreground">{game.description}</p>

      <div className="flex gap-2">
        {game.modes.map((m) => (
          <button
            key={m.slug}
            onClick={() => setMode(m.slug)}
            className={`rounded-md px-4 py-2 text-sm font-medium border ${
              mode === m.slug
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      {!countries ? (
        <p className="text-muted-foreground">Loading countries...</p>
      ) : (
        <>
          {mode === "countries" && (
            <CountriesMapMode key="countries" gameSlug={game.slug} countries={countries} />
          )}
          {mode === "capitals" && (
            <CapitalsMode key="capitals" gameSlug={game.slug} countries={countries} />
          )}
          {mode === "flags" && <FlagsMode key="flags" gameSlug={game.slug} countries={countries} />}
        </>
      )}
    </main>
  );
}
