"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getGame } from "@/lib/games/registry";
import { fetchCities, type City } from "@/lib/games/data";

// These mode components use browser-only APIs (globe.gl) and are behind
// login with no SEO value, so there's nothing gained from prerendering them.
const TypeAllMode = dynamic(() => import("./TypeAllMode").then((m) => m.TypeAllMode), {
  ssr: false,
});
const ClickDotMode = dynamic(() => import("./ClickDotMode").then((m) => m.ClickDotMode), {
  ssr: false,
});
const ProximityMode = dynamic(() => import("./ProximityMode").then((m) => m.ProximityMode), {
  ssr: false,
});

const game = getGame("sweden-cities")!;

export default function SwedenCitiesPage() {
  const [mode, setMode] = useState(game.modes[0].slug);
  const [cities, setCities] = useState<City[] | null>(null);

  useEffect(() => {
    fetchCities(game.dataFile).then(setCities);
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

      {!cities ? (
        <p className="text-muted-foreground">Loading cities...</p>
      ) : (
        <>
          {mode === "type-all" && <TypeAllMode key="type-all" cities={cities} />}
          {mode === "click-dot" && <ClickDotMode key="click-dot" cities={cities} />}
          {mode === "proximity" && <ProximityMode key="proximity" cities={cities} />}
        </>
      )}
    </main>
  );
}
