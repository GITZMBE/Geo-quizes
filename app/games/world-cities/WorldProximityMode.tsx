"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeMethods } from "react-globe.gl";
import { useGameState } from "@/lib/state/useGameState";
import { GlobeView } from "@/components/GlobeView";
import { Leaderboard } from "@/components/Leaderboard";
import { worldProximityState } from "@/lib/state/gameAtoms";
import type { WorldCity } from "@/lib/games/data";
import { haversineDistanceKm, proximityScore, shuffle } from "@/lib/games/geo";
import { submitScore } from "@/lib/games/scores";
import { getGame } from "@/lib/games/registry";

const game = getGame("world-cities")!;
const mode = game.modes.find((m) => m.slug === "proximity")!;

const ROUNDS = 5;
// A right-continent guess should still earn partial credit at world scale,
// unlike the tighter decay that suits a single-country game.
const WORLD_DECAY_KM = 3000;
const WORLD_VIEW = { lat: 15, lng: 10, altitude: 2.2 };

type MarkerPoint = { lat: number; lng: number; color: string };

export function WorldProximityMode({ cities }: { cities: WorldCity[] }) {
  const globeRef = useRef<GlobeMethods>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [state, setState] = useGameState(worldProximityState);
  const submittedRef = useRef(false);

  const byId = new Map(cities.map((c) => [c.id, c]));

  useEffect(() => {
    if (state.order.length === 0 && cities.length > 0) {
      setState({
        order: shuffle(cities.map((c) => c.id)).slice(0, ROUNDS),
        index: 0,
        totalScore: 0,
        lastGuess: null,
        finished: false,
      });
    }
  }, [cities, state.order.length, setState]);

  // Gated on globeReady (react-globe.gl's onGlobeReady), not just
  // `cities.length` — GlobeView mounts the actual globe asynchronously
  // (after its ResizeObserver reports a real size), and cities.length is
  // already nonzero on this component's very first render, so relying on
  // it alone races the ref and silently no-ops.
  useEffect(() => {
    if (cities.length === 0 || !globeReady) return;
    globeRef.current?.pointOfView(WORLD_VIEW, 0);
  }, [cities.length, globeReady]);

  const target = byId.get(state.order[state.index]);

  function handleGlobeClick(coords: { lat: number; lng: number }) {
    setState((prev) => {
      if (prev.finished || prev.lastGuess) return prev;
      const currentTarget = byId.get(prev.order[prev.index]);
      if (!currentTarget) return prev;
      const distanceKm = haversineDistanceKm(coords, currentTarget);
      const points = proximityScore(distanceKm, WORLD_DECAY_KM);
      return { ...prev, lastGuess: { ...coords, distanceKm, points } };
    });
  }

  const points: MarkerPoint[] =
    state.lastGuess && target
      ? [
          { lat: state.lastGuess.lat, lng: state.lastGuess.lng, color: "#2563eb" },
          { lat: target.lat, lng: target.lng, color: "#16a34a" },
        ]
      : [];

  const arcs =
    state.lastGuess && target
      ? [
          {
            startLat: state.lastGuess.lat,
            startLng: state.lastGuess.lng,
            endLat: target.lat,
            endLng: target.lng,
          },
        ]
      : [];

  function nextRound() {
    setState((prev) => {
      const nextIndex = prev.index + 1;
      const finished = nextIndex >= prev.order.length;
      return {
        ...prev,
        index: nextIndex,
        finished,
        totalScore: prev.totalScore + (prev.lastGuess?.points ?? 0),
        lastGuess: null,
      };
    });
  }

  useEffect(() => {
    if (state.finished && !submittedRef.current) {
      submittedRef.current = true;
      submitScore(game.slug, mode.slug, state.totalScore).catch(() => {});
    }
  }, [state.finished, state.totalScore]);

  function playAgain() {
    submittedRef.current = false;
    setState({
      order: shuffle(cities.map((c) => c.id)).slice(0, ROUNDS),
      index: 0,
      totalScore: 0,
      lastGuess: null,
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
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            {!state.lastGuess ? (
              <>
                <span className="text-lg font-medium">
                  Click where you think{" "}
                  <span className="font-bold">
                    {target?.name}, {target?.country}
                  </span>{" "}
                  is
                </span>
                <span className="ml-3 text-sm text-muted-foreground">
                  Round {state.index + 1}/{ROUNDS} · Score: {state.totalScore}
                </span>
              </>
            ) : (
              <div className="flex items-center justify-center gap-4">
                <span>
                  {Math.round(state.lastGuess.distanceKm)} km away —{" "}
                  <span className="font-bold">{state.lastGuess.points} pts</span>
                </span>
                <button
                  onClick={nextRound}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {state.index + 1 >= ROUNDS ? "See results" : "Next city"}
                </button>
              </div>
            )}
          </div>
          <div className="relative flex-1 rounded-lg border border-border overflow-hidden">
            <GlobeView
              ref={globeRef}
              onGlobeReady={() => setGlobeReady(true)}
              pointsData={points}
              pointColor={(p) => (p as MarkerPoint).color}
              pointAltitude={0.01}
              pointRadius={0.35}
              arcsData={arcs}
              arcColor={() => "#f59e0b"}
              arcStroke={0.4}
              arcDashLength={1}
              arcDashGap={0}
              onGlobeClick={handleGlobeClick}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">{state.totalScore} pts</p>
            <p className="text-muted-foreground">Across {ROUNDS} rounds</p>
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
