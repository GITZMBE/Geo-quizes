"use client";

import { useEffect, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { Leaderboard } from "@/components/Leaderboard";
import { GameResultActions } from "@/components/games/GameResultActions";
import type { RoadFeature } from "@/lib/games/data";
import { useRoundGame } from "@/lib/games/useRoundGame";
import { useGameState } from "@/lib/state/useGameState";
import { getRoundState } from "@/lib/state/gameAtoms";
import { shuffle } from "@/lib/games/geo";
import { normalizeRoadAnswer } from "@/lib/games/text";

const ROUND_SIZE = 5;

// A road assembled from multiple OSM relation segments (common — many of
// these roads merge 2+ segments) doesn't have its segments necessarily
// concatenated in true end-to-end geographic order, so "first/last
// coordinate of the geometry array" can land a marker in the middle of the
// route instead of at its real extremity. Instead: take every segment's own
// two endpoints as candidates, and pick the pair that's farthest apart —
// the true geographic ends of a real point-to-point road are reliably
// among a segment boundary, even when segment order itself is jumbled.
function geographicExtremes(geometry: RoadFeature["geometry"]) {
  const lines: [number, number][][] =
    geometry.type === "LineString" ? [geometry.coordinates as [number, number][]] : (geometry.coordinates as [number, number][][]);
  const candidates = lines.flatMap((line) => [line[0], line[line.length - 1]]);

  let best: { a: [number, number]; b: [number, number]; dist: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const [aLng, aLat] = candidates[i];
      const [bLng, bLat] = candidates[j];
      const dist = (aLng - bLng) ** 2 + (aLat - bLat) ** 2;
      if (!best || dist > best.dist) best = { a: candidates[i], b: candidates[j], dist };
    }
  }
  return best ? [best.a, best.b] : [candidates[0], candidates[0]];
}

// Swedish national/county road numbers are assigned southwest-to-northeast
// (stated on the Wikipedia source this data comes from), so once the two
// geographic extremes are found, the more southwesterly one is fromPlace —
// approximated as the smaller lat+lng sum, matching that diagonal.
function endpointMarkers(road: RoadFeature) {
  const [p1, p2] = geographicExtremes(road.geometry);
  const sw = p1[0] + p1[1] <= p2[0] + p2[1] ? p1 : p2;
  const ne = sw === p1 ? p2 : p1;
  return [
    { lat: sw[1], lng: sw[0], label: road.properties.fromPlace },
    { lat: ne[1], lng: ne[0], label: road.properties.toPlace },
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

  const byName = new Map(items.map((r) => [r.properties.name, r]));
  const targetRoad = target ? byName.get(target) : undefined;

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
                regionsData={[targetRoad]}
                projection={projection}
                fill={() => "none"}
                stroke={() =>
                  state.lastResult === "correct"
                    ? "var(--success)"
                    : state.lastResult === "wrong"
                      ? "var(--error)"
                      : "var(--primary)"
                }
                strokeWidth={() => 4}
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
            <Leaderboard key={String(state.finished)} gameSlug={game.slug} mode={mode} />
          </div>
        </div>
      )}
    </div>
  );
}
