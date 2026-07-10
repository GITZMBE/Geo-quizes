"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameState } from "@/lib/state/useGameState";
import { worldCountriesTypeAllState } from "@/lib/state/gameAtoms";
import type { WorldCountry } from "@/lib/games/data";
import { getAutocompleteMatch } from "@/lib/games/text";
import { submitScore, formatScoreValue } from "@/lib/games/scores";
import { Leaderboard } from "@/components/Leaderboard";
import { GameResultActions } from "@/components/games/GameResultActions";
import { getGame } from "@/lib/games/registry";

const game = getGame("world-countries")!;
const mode = game.modes.find((m) => m.slug === "type-all")!;

export function TypeAllMode({ countries }: { countries: WorldCountry[] }) {
  const [state, setState] = useGameState(worldCountriesTypeAllState);
  const [input, setInput] = useState("");
  const [now, setNow] = useState<number | null>(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  const guessedSet = useMemo(() => new Set(state.guessedIds), [state.guessedIds]);
  const remaining = useMemo(
    () => countries.filter((c) => !guessedSet.has(c.id)),
    [countries, guessedSet]
  );
  const finished = state.finishedAt !== null;

  useEffect(() => {
    if (state.startedAt === null) {
      setState((prev) => ({ ...prev, startedAt: Date.now() }));
    }
  }, [state.startedAt, setState]);

  useEffect(() => {
    if (finished) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [finished]);

  useEffect(() => {
    if (!finished && state.guessedIds.length === countries.length && countries.length > 0) {
      setState((prev) => ({ ...prev, finishedAt: Date.now() }));
    }
  }, [state.guessedIds.length, countries.length, finished, setState]);

  useEffect(() => {
    if (finished && !state.gaveUp && !submittedRef.current && state.startedAt) {
      submittedRef.current = true;
      submitScore(game.slug, mode.slug, state.finishedAt! - state.startedAt).catch(() => {});
    }
  }, [finished, state.gaveUp, state.startedAt, state.finishedAt]);

  function handleChange(value: string) {
    const suggestion = getAutocompleteMatch(value, remaining.map((c) => c.name));
    if (suggestion) {
      const match = remaining.find((c) => c.name === suggestion);
      if (match) {
        setState((prev) => ({ ...prev, guessedIds: [...prev.guessedIds, match.id] }));
      }
      setInput("");
      return;
    }
    setInput(value);
  }

  function handleSubmit() {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;
    const match = remaining.find((c) => c.name.toLowerCase() === trimmed);
    if (match) {
      setState((prev) => ({ ...prev, guessedIds: [...prev.guessedIds, match.id] }));
    }
    setInput("");
  }

  function giveUp() {
    setState((prev) => ({ ...prev, finishedAt: Date.now(), gaveUp: true }));
  }

  function playAgain() {
    submittedRef.current = false;
    setState({ guessedIds: [], startedAt: Date.now(), finishedAt: null, gaveUp: false });
    setInput("");
  }

  const elapsedMs = state.startedAt
    ? (finished ? state.finishedAt! : (now ?? state.startedAt)) - state.startedAt
    : 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
        <span className="text-lg font-medium">
          {state.guessedIds.length} / {countries.length} guessed
        </span>
        <span className="text-lg font-mono">{formatScoreValue("TIME_MS", elapsedMs)}</span>
        {!finished && (
          <button
            onClick={giveUp}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Give up
          </button>
        )}
      </div>

      {!finished ? (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          autoFocus
          placeholder="Type a country name..."
          className="w-full rounded-md border border-border bg-surface px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-2xl font-bold">
            {state.gaveUp
              ? `You named ${state.guessedIds.length} / ${countries.length}`
              : `Completed in ${formatScoreValue("TIME_MS", elapsedMs)}!`}
          </p>
          <GameResultActions onPlayAgain={playAgain} />
          <div className="w-full max-w-sm">
            <Leaderboard
              key={String(finished)}
              gameSlug={game.slug}
              mode={mode}
              currentScore={state.gaveUp ? undefined : elapsedMs}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-8">
        {countries.map((country) => (
          <div
            key={country.id}
            className={`rounded-md border px-1 py-2 text-center text-xs ${
              guessedSet.has(country.id)
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-surface text-muted-foreground"
            }`}
            title={guessedSet.has(country.id) ? country.name : undefined}
          >
            <div className="font-mono">{country.rank}</div>
            <div className="truncate">{guessedSet.has(country.id) ? country.name : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
