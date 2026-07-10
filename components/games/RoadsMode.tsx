"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { Leaderboard } from "@/components/Leaderboard";
import { GameResultActions } from "@/components/games/GameResultActions";
import { fetchRegions, type RegionFeature, type RoadFeature } from "@/lib/games/data";
import { useRoundGame } from "@/lib/games/useRoundGame";
import { useGameState } from "@/lib/state/useGameState";
import { getRoundState } from "@/lib/state/gameAtoms";
import { shuffle } from "@/lib/games/geo";
import { normalizeRoadAnswer } from "@/lib/games/text";

const ROUND_SIZE = 5;

function isLineFeature(feature: RegionFeature) {
  return feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString";
}

// fromLat/fromLng/toLat/toLng are fixed at data-build time (see
// scripts/build-swedish-roads-{primary,secondary}.js) by geocoding
// fromPlace/toPlace and matching each to its nearer geometry extremity —
// deriving this from geometry/compass-direction at render time was tried
// and was wrong for any road that doesn't happen to run southwest-to-
// northeast, so this reads the precomputed, per-road-correct coordinates
// directly instead of guessing.
function endpointMarkers(road: RoadFeature) {
  return [
    { lat: road.properties.fromLat, lng: road.properties.fromLng, label: road.properties.fromPlace },
    { lat: road.properties.toLat, lng: road.properties.toLng, label: road.properties.toPlace },
  ];
}

export function RoadsMode({
  gameSlug,
  modeSlug,
  roads,
  projection = "mercator",
}: {
  gameSlug: string;
  modeSlug: string;
  roads: RoadFeature[];
  projection?: "mercator" | "albersUsa" | "pacific";
}) {
  // useRoundGame shuffles ALL of `items` into the round — there's no
  // built-in cap to "5 of a larger pool" the way this game needs. A stable
  // subset is picked once per mount here instead; playAgain below (not
  // useRoundGame's own) is responsible for drawing a fresh one.
  const [items, setItems] = useState(() => shuffle(roads).slice(0, ROUND_SIZE));

  const { game, mode, state, target, submitGuess, playAgain: resetForStaleItems } = useRoundGame({
    gameSlug,
    modeSlug,
    items,
    getId: (r) => r.properties.name,
  });
  // useRoundGame's own `playAgain` is still called below for its
  // submittedRef-reset side effect (private to that hook, otherwise never
  // cleared, which would silently stop score submission after the first
  // round) — but its own reshuffle result is immediately overwritten, since
  // it closes over this render's (stale, old-subset) `items`, not the fresh
  // subset a "5 of a larger pool" round needs.
  const [, setRoundState] = useGameState(getRoundState(`${gameSlug}:${modeSlug}`));

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sweden's own outline, drawn as background context so the highlighted
  // road reads as "a road somewhere in Sweden" instead of an isolated
  // squiggle with no frame of reference — reused from the Countries of
  // Europe game's data rather than sourcing a dedicated Sweden-only file.
  // Combining it into MapView's regionsData also means fitSize fits the
  // whole country (Sweden's extent dwarfs any single road's), so the
  // default zoomed-out view shows all of Sweden instead of just the
  // road's own tight bounding box.
  const [sweden, setSweden] = useState<RegionFeature | null>(null);
  useEffect(() => {
    fetchRegions("/data/countries_europe.json").then((features) => {
      setSweden(features.find((f) => f.properties.name === "Sweden") ?? null);
    });
  }, []);

  const byName = new Map(items.map((r) => [r.properties.name, r]));
  const targetRoad = target ? byName.get(target) : undefined;

  // Memoized so this array keeps a stable identity across re-renders where
  // neither sweden nor targetRoad actually changed — MapView resets its
  // zoom/pan whenever regionsData's identity changes, so a fresh array
  // literal every render would reset the player's zoom on every keystroke.
  const mapData = useMemo<RegionFeature[]>(() => {
    if (!targetRoad) return [];
    return sweden ? [sweden, targetRoad] : [targetRoad];
  }, [sweden, targetRoad]);

  // Same reason as CapitalsMode: the input is disabled during the
  // correct/wrong feedback window, which browser-blurs it.
  useEffect(() => {
    if (!state.lastResult && !state.finished) {
      inputRef.current?.focus();
    }
  }, [state.lastResult, state.finished]);

  function guess(answer: string) {
    submitGuess(
      answer,
      !!targetRoad && normalizeRoadAnswer(answer) === normalizeRoadAnswer(targetRoad.properties.designation)
    );
    setInput("");
  }

  function playAgain() {
    resetForStaleItems();
    const nextItems = shuffle(roads).slice(0, ROUND_SIZE);
    setItems(nextItems);
    setRoundState({
      order: shuffle(nextItems.map((r) => r.properties.name)),
      index: 0,
      score: 0,
      lastAnswer: null,
      lastResult: null,
      wrongGuesses: [],
      correctGuesses: [],
      finished: false,
    });
  }

  if (roads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-lg font-medium">No roads available for this mode yet.</p>
        <p>Check back soon — more road data is on the way.</p>
      </div>
    );
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
            {!state.lastResult ? (
              <>
                Name this road
                <span className="ml-3 text-sm text-muted-foreground">
                  ({state.index + 1}/{state.order.length}) · Score: {state.score}
                </span>
              </>
            ) : (
              <span>
                {state.lastResult === "correct" ? "Correct!" : "Not quite —"}{" "}
                this road is <span className="font-bold">{targetRoad?.properties.designation}</span>
              </span>
            )}
          </div>

          <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg border border-border">
            {targetRoad && (
              <MapView
                regionsData={mapData}
                projection={projection}
                fill={(f) => (isLineFeature(f) ? "none" : "var(--muted)")}
                stroke={(f) => {
                  if (!isLineFeature(f)) return "var(--border)";
                  return state.lastResult === "correct"
                    ? "var(--success)"
                    : state.lastResult === "wrong"
                      ? "var(--error)"
                      : "var(--primary)";
                }}
                strokeWidth={(f) => (isLineFeature(f) ? 4 : 1)}
                markers={endpointMarkers(targetRoad)}
              />
            )}
          </div>

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) guess(input.trim());
            }}
            disabled={!!state.lastResult}
            autoFocus
            placeholder="Type the route number..."
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">
              {state.score} / {state.order.length}
            </p>
            <p className="text-muted-foreground">Roads correctly identified</p>
          </div>
          <GameResultActions onPlayAgain={playAgain} />
          <div className="w-full max-w-sm">
            <Leaderboard key={String(state.finished)} gameSlug={game.slug} mode={mode} currentScore={state.score} />
          </div>
        </div>
      )}
    </div>
  );
}
