"use client";

import { useEffect, useRef, useState } from "react";
import { useGameState } from "@/lib/state/useGameState";
import type { GlobeInstance } from "globe.gl";
import { GlobeView } from "@/components/GlobeView";
import { Leaderboard } from "@/components/Leaderboard";
import { swedenClickDotState } from "@/lib/state/gameAtoms";
import type { City } from "@/lib/games/data";
import { shuffle } from "@/lib/games/geo";
import { submitScore } from "@/lib/games/scores";
import { getGame } from "@/lib/games/registry";

const game = getGame("sweden-cities")!;
const mode = game.modes.find((m) => m.slug === "click-dot")!;

const SWEDEN_VIEW = { lat: 62.5, lng: 16.5, altitude: 1.1 };

export function ClickDotMode({ cities }: { cities: City[] }) {
  const [globe, setGlobe] = useState<GlobeInstance | null>(null);
  const [state, setState] = useGameState(swedenClickDotState);
  const submittedRef = useRef(false);

  const byRank = new Map(cities.map((c) => [c.rank, c]));

  useEffect(() => {
    if (state.order.length === 0 && cities.length > 0) {
      setState({
        order: shuffle(cities.map((c) => c.rank)),
        index: 0,
        score: 0,
        lastClicked: null,
        lastResult: null,
        finished: false,
      });
    }
  }, [cities, state.order.length, setState]);

  useEffect(() => {
    if (!globe || cities.length === 0) return;
    globe
      .pointAltitude(0.01)
      .pointRadius(0.35)
      .pointLabel((p) => (p as City).name)
      .pointsData(cities)
      .pointOfView(SWEDEN_VIEW, 0);
    globe.controls().enableRotate = false;
  }, [globe, cities]);

  const target = byRank.get(state.order[state.index]);

  useEffect(() => {
    if (!globe) return;
    globe.pointColor((p) => {
      const city = p as City;
      if (state.lastResult) {
        if (city.rank === target?.rank) return "#16a34a";
        if (city.rank === state.lastClicked && state.lastResult === "wrong") return "#dc2626";
      }
      return "#2563eb";
    });
  }, [globe, target, state.lastClicked, state.lastResult]);

  useEffect(() => {
    if (!globe) return;
    globe.onPointClick((point) => {
      const clicked = point as City;
      setState((prev) => {
        if (prev.finished || prev.lastResult) return prev;
        const currentTarget = byRank.get(prev.order[prev.index]);
        const correct = clicked.rank === currentTarget?.rank;
        return {
          ...prev,
          lastClicked: clicked.rank,
          lastResult: correct ? "correct" : "wrong",
          score: correct ? prev.score + 1 : prev.score,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globe, setState]);

  useEffect(() => {
    if (!state.lastResult) return;
    const timeout = setTimeout(() => {
      setState((prev) => {
        const nextIndex = prev.index + 1;
        const finished = nextIndex >= prev.order.length;
        return { ...prev, index: nextIndex, finished, lastClicked: null, lastResult: null };
      });
    }, 900);
    return () => clearTimeout(timeout);
  }, [state.lastResult, setState]);

  useEffect(() => {
    if (state.finished && !submittedRef.current) {
      submittedRef.current = true;
      submitScore(game.slug, mode.slug, state.score).catch(() => {});
    }
  }, [state.finished, state.score]);

  function playAgain() {
    submittedRef.current = false;
    setState({
      order: shuffle(cities.map((c) => c.rank)),
      index: 0,
      score: 0,
      lastClicked: null,
      lastResult: null,
      finished: false,
    });
  }

  if (state.order.length === 0) {
    return <p className="text-muted-foreground">Loading map...</p>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {!state.finished ? (
        <>
          <div
            className={`rounded-lg border p-4 text-center text-lg font-medium transition-colors ${
              state.lastResult === "correct"
                ? "border-success bg-success/10 text-success"
                : state.lastResult === "wrong"
                  ? "border-error bg-error/10 text-error"
                  : "border-border bg-surface"
            }`}
          >
            Click on: <span className="font-bold">{target?.name}</span>
            <span className="ml-3 text-sm text-muted-foreground">
              ({state.index + 1}/{state.order.length}) · Score: {state.score}
            </span>
          </div>
          <div className="flex-1 rounded-lg border border-border overflow-hidden">
            <GlobeView onReady={setGlobe} />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">
              {state.score} / {state.order.length}
            </p>
            <p className="text-muted-foreground">Cities correctly identified</p>
          </div>
          <button
            onClick={playAgain}
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Play again
          </button>
          <div className="w-full max-w-sm">
            <Leaderboard key={String(state.finished)} gameSlug={game.slug} mode={mode} />
          </div>
        </div>
      )}
    </div>
  );
}
