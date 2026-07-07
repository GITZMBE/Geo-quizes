"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeMethods } from "react-globe.gl";
import { useGameState } from "@/lib/state/useGameState";
import { GlobeView } from "@/components/GlobeView";
import { Leaderboard } from "@/components/Leaderboard";
import { usStatesGameState } from "@/lib/state/gameAtoms";
import { fetchRegions, type RegionFeature } from "@/lib/games/data";
import { shuffle } from "@/lib/games/geo";
import { submitScore } from "@/lib/games/scores";
import { getGame } from "@/lib/games/registry";

const game = getGame("us-states")!;
const mode = game.modes[0];

// Framed on the contiguous states — Alaska and Hawaii are real geographic
// distances away (unlike an inset map), so rotation stays enabled (unlike
// Stockholm/Sweden's locked regional camera) and the player pans/zooms to
// reach them and to precisely click small states.
const US_VIEW = { lat: 40, lng: -98, altitude: 1.6 };

export default function USStatesGame() {
  const globeRef = useRef<GlobeMethods>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [states, setStates] = useState<RegionFeature[] | null>(null);
  const [state, setState] = useGameState(usStatesGameState);
  const submittedRef = useRef(false);

  // Load state borders + start a fresh shuffled run on mount. Guarded on
  // `states` (not just the dependency array) — useGameState's setState is a
  // new function identity every render, so an unguarded effect here would
  // refetch and reshuffle on every render it causes, one after another,
  // endlessly changing the current target (this bit Stockholm Districts —
  // see its fix for the full explanation).
  useEffect(() => {
    if (states) return;
    fetchRegions(game.dataFile).then((features) => {
      setStates(features);
      setState({
        order: shuffle(features.map((f) => f.properties.name)),
        index: 0,
        score: 0,
        lastClicked: null,
        lastResult: null,
        finished: false,
      });
    });
  }, [states, setState]);

  // Set the initial camera once the globe + states are ready. Gated on
  // globeReady (react-globe.gl's onGlobeReady), not just `states` —
  // GlobeView mounts the actual globe asynchronously (after its
  // ResizeObserver reports a real size), so globeRef.current can still be
  // null when `states` first resolves.
  useEffect(() => {
    if (!states || !globeReady) return;
    globeRef.current?.pointOfView(US_VIEW, 0);
  }, [states, globeReady]);

  const target = state.order[state.index];

  function handlePolygonClick(polygon: object) {
    const clickedName = (polygon as RegionFeature).properties.name;
    setState((prev) => {
      if (prev.finished || prev.lastResult) return prev;
      const currentTarget = prev.order[prev.index];
      const correct = clickedName === currentTarget;
      return {
        ...prev,
        lastClicked: clickedName,
        lastResult: correct ? "correct" : "wrong",
        score: correct ? prev.score + 1 : prev.score,
      };
    });
  }

  // After showing feedback briefly, advance to the next round (or finish).
  useEffect(() => {
    if (!state.lastResult) return;
    const timeout = setTimeout(() => {
      setState((prev) => {
        const nextIndex = prev.index + 1;
        const finished = nextIndex >= prev.order.length;
        return {
          ...prev,
          index: nextIndex,
          finished,
          lastClicked: null,
          lastResult: null,
        };
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
    if (!states) return;
    setState({
      order: shuffle(states.map((f) => f.properties.name)),
      index: 0,
      score: 0,
      lastClicked: null,
      lastResult: null,
      finished: false,
    });
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">{game.name}</h1>

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
            {states ? (
              <>
                Click on: <span className="font-bold">{target}</span>
                <span className="ml-3 text-sm text-muted-foreground">
                  ({state.index + 1}/{state.order.length}) · Score: {state.score}
                </span>
              </>
            ) : (
              "Loading map..."
            )}
          </div>

          <div className="relative flex-1 rounded-lg border border-border overflow-hidden">
            {states && (
              <GlobeView
                ref={globeRef}
                onGlobeReady={() => setGlobeReady(true)}
                polygonsData={states}
                polygonAltitude={0.008}
                polygonStrokeColor={() => "#0f172a"}
                polygonLabel={(f) => (f as RegionFeature).properties.name}
                polygonCapColor={(f) => {
                  const name = (f as RegionFeature).properties.name;
                  if (state.lastResult) {
                    if (name === target) return "rgba(22, 163, 74, 0.75)";
                    if (name === state.lastClicked && state.lastResult === "wrong") {
                      return "rgba(220, 38, 38, 0.75)";
                    }
                  }
                  // Fully transparent, not a faint tint, for every other
                  // state — three-globe's polygon cap material is
                  // transparent + depthWrite:true, which produces a hazy
                  // colored wash across the whole globe once more than a
                  // couple of polygons share a nonzero-alpha cap color at
                  // once (confirmed by bisecting: 2 tinted caps render
                  // clean, 3+ don't). At most 1-2 states are ever
                  // colored here (the target/last-clicked pair during
                  // feedback), which stays under that threshold.
                  return "rgba(0, 0, 0, 0)";
                }}
                onPolygonClick={handlePolygonClick}
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">
              {state.score} / {state.order.length}
            </p>
            <p className="text-muted-foreground">States correctly identified</p>
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
    </main>
  );
}
