"use client";

import Link from "next/link";
import { useState } from "react";
import { GAMES } from "@/lib/games/registry";

export default function GamesPage() {
  const [query, setQuery] = useState("");

  const filtered = GAMES.filter((game) =>
    game.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-8 max-w-3xl mx-auto w-full">
      <h1 className="text-3xl font-bold">Games</h1>

      <input
        type="search"
        placeholder="Search games..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-border bg-surface px-4 py-2 outline-none focus:ring-2 focus:ring-primary"
      />

      <ul className="flex flex-col gap-3">
        {filtered.map((game) => (
          <li key={game.slug}>
            <Link
              href={`/games/${game.slug}`}
              className="block rounded-lg border border-border bg-surface p-4 hover:border-primary transition-colors"
            >
              <h2 className="text-lg font-semibold">{game.name}</h2>
              <p className="text-sm text-muted-foreground">{game.description}</p>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <p className="text-muted-foreground">No games match your search.</p>
        )}
      </ul>
    </main>
  );
}
