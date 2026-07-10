"use client";

import { useState } from "react";
import type { GameDefinition, GameMode } from "@/lib/games/registry";

// Shared "pick a mode, then press Start" shell for every game page. Mode
// selection resets the Start gate (so switching modes doesn't silently
// carry you into a different game already running), and the mode
// component itself isn't mounted until Start is pressed — for the
// TIME_MS "type them all" modes that also means the clock only starts
// once the player actually begins, not while they're still reading the
// mode picker.
export function GameShell({
  game,
  ready,
  children,
}: {
  game: GameDefinition;
  // Whether the game's data has finished loading — the Start button stays
  // disabled until then so pressing it can mount the mode component
  // immediately instead of showing a second loading state.
  ready: boolean;
  children: (mode: GameMode) => React.ReactNode;
}) {
  const [modeSlug, setModeSlug] = useState(game.modes[0].slug);
  const [started, setStarted] = useState(false);
  const mode = game.modes.find((m) => m.slug === modeSlug) ?? game.modes[0];

  function selectMode(slug: string) {
    setModeSlug(slug);
    setStarted(false);
  }

  if (started) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <button
          type="button"
          onClick={() => setStarted(false)}
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          {game.modes.length > 1 ? "← Change mode" : "← Back"}
        </button>
        {children(mode)}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {game.modes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {game.modes.map((m) => (
            <button
              key={m.slug}
              onClick={() => selectMode(m.slug)}
              className={`rounded-md px-4 py-2 text-sm font-medium border ${
                mode.slug === m.slug
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface p-8 text-center">
        <h2 className="text-xl font-semibold">{mode.name}</h2>
        <p className="max-w-md text-muted-foreground">{game.description}</p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          disabled={!ready}
          className="rounded-md bg-primary px-8 py-3 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {ready ? "Start" : "Loading..."}
        </button>
      </div>
    </div>
  );
}
