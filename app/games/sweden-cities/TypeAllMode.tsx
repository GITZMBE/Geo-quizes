"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameState } from "@/lib/state/useGameState";
import { swedenTypeAllState } from "@/lib/state/gameAtoms";
import type { City } from "@/lib/games/data";
import { submitScore, formatScoreValue } from "@/lib/games/scores";
import { Leaderboard } from "@/components/Leaderboard";
import { GameResultActions } from "@/components/games/GameResultActions";
import { getGame } from "@/lib/games/registry";

const game = getGame("sweden-cities")!;
const mode = game.modes.find((m) => m.slug === "type-all")!;

const MIN_AUTOCOMPLETE_CHARS = 5;

function getAutocomplete(input: string, remaining: City[]): string | null {
  if (input.length < MIN_AUTOCOMPLETE_CHARS) return null;
  const lower = input.toLowerCase();
  const matches = remaining.filter((c) => c.name.toLowerCase().startsWith(lower));
  return matches.length === 1 ? matches[0].name : null;
}

export function TypeAllMode({ cities }: { cities: City[] }) {
  const [state, setState] = useGameState(swedenTypeAllState);
  const [input, setInput] = useState("");
  const [now, setNow] = useState<number | null>(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  const guessedSet = useMemo(() => new Set(state.guessedRanks), [state.guessedRanks]);
  const remaining = useMemo(
    () => cities.filter((c) => !guessedSet.has(c.rank)),
    [cities, guessedSet]
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
    if (!finished && state.guessedRanks.length === cities.length && cities.length > 0) {
      setState((prev) => ({ ...prev, finishedAt: Date.now() }));
    }
  }, [state.guessedRanks.length, cities.length, finished, setState]);

  useEffect(() => {
    if (finished && !state.gaveUp && !submittedRef.current && state.startedAt) {
      submittedRef.current = true;
      submitScore(game.slug, mode.slug, state.finishedAt! - state.startedAt).catch(() => {});
    }
  }, [finished, state.gaveUp, state.startedAt, state.finishedAt]);

  function handleChange(value: string) {
    const suggestion = getAutocomplete(value, remaining);
    if (suggestion) {
      const match = remaining.find((c) => c.name === suggestion);
      if (match) {
        setState((prev) => ({ ...prev, guessedRanks: [...prev.guessedRanks, match.rank] }));
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
      setState((prev) => ({ ...prev, guessedRanks: [...prev.guessedRanks, match.rank] }));
    }
    setInput("");
  }

  function giveUp() {
    setState((prev) => ({ ...prev, finishedAt: Date.now(), gaveUp: true }));
  }

  function playAgain() {
    submittedRef.current = false;
    setState({ guessedRanks: [], startedAt: Date.now(), finishedAt: null, gaveUp: false });
    setInput("");
  }

  const elapsedMs = state.startedAt
    ? (finished ? state.finishedAt! : now ?? state.startedAt) - state.startedAt
    : 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
        <span className="text-lg font-medium">
          {state.guessedRanks.length} / {cities.length} guessed
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
          placeholder="Type a city name..."
          className="w-full rounded-md border border-border bg-surface px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-2xl font-bold">
            {state.gaveUp
              ? `You named ${state.guessedRanks.length} / ${cities.length}`
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

      <div className="grid grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-10">
        {cities.map((city) => (
          <div
            key={city.rank}
            className={`rounded-md border px-1 py-2 text-center text-xs ${
              guessedSet.has(city.rank)
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-surface text-muted-foreground"
            }`}
            title={guessedSet.has(city.rank) ? city.name : undefined}
          >
            <div className="font-mono">{city.rank}</div>
            <div className="truncate">{guessedSet.has(city.rank) ? city.name : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
