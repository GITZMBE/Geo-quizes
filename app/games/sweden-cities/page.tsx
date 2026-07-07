"use client";

import { useState } from "react";
import { GlobeView } from "@/components/GlobeView";
import { getGame } from "@/lib/games/registry";

const game = getGame("sweden-cities")!;

export default function SwedenCitiesPage() {
  const [mode, setMode] = useState(game.modes[0].slug);

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

      {mode === "type-all" && (
        // TODO: free-text input, min 5 chars before unambiguous-match autocomplete,
        // builds a ranked 1-100 list of correctly guessed cities as you go
        <div className="flex-1 rounded-lg border border-border p-6 text-muted-foreground">
          Type-them-all mode — coming soon.
        </div>
      )}

      {mode === "click-dot" && (
        // TODO: dots for all 100 cities, one target named, click the matching dot
        <div className="flex-1 rounded-lg border border-border overflow-hidden">
          <GlobeView />
        </div>
      )}

      {mode === "proximity" && (
        // TODO: 5 random cities one at a time, click your guess, score by distance to actual point
        <div className="flex-1 rounded-lg border border-border overflow-hidden">
          <GlobeView />
        </div>
      )}
    </main>
  );
}
