"use client";

import { useEffect, useRef, useState } from "react";
import { useGameState } from "@/lib/state/useGameState";
import type { GlobeInstance } from "globe.gl";
import { GlobeView } from "@/components/GlobeView";
import { Leaderboard } from "@/components/Leaderboard";
import { swedenProximityState } from "@/lib/state/gameAtoms";
import type { City } from "@/lib/games/data";
import { haversineDistanceKm, proximityScore, shuffle } from "@/lib/games/geo";
import { submitScore } from "@/lib/games/scores";
import { getGame } from "@/lib/games/registry";

const game = getGame("sweden-cities")!;
const mode = game.modes.find((m) => m.slug === "proximity")!;

const ROUNDS = 5;
const SWEDEN_VIEW = { lat: 62.5, lng: 16.5, altitude: 1.1 };

type MarkerPoint = { lat: number; lng: number; color: string };

export function ProximityMode({ cities }: { cities: City[] }) {
  const [globe, setGlobe] = useState<GlobeInstance | null>(null);
  const [state, setState] = useGameState(swedenProximityState);
  const submittedRef = useRef(false);

  const byRank = new Map(cities.map((c) => [c.rank, c]));

  useEffect(() => {
    if (state.order.length === 0 && cities.length > 0) {
      setState({
        order: shuffle(cities.map((c) => c.rank)).slice(0, ROUNDS),
        index: 0,
        totalScore: 0,
        lastGuess: null,
        finished: false,
      });
    }
  }, [cities, state.order.length, setState]);

  useEffect(() => {
    if (!globe) return;
    globe.pointOfView(SWEDEN_VIEW, 0);
    globe.controls().enableRotate = false;
  }, [globe]);

  const target = byRank.get(state.order[state.index]);

  useEffect(() => {
    if (!globe) return;
    globe.onGlobeClick((coords) => {
      setState((prev) => {
        if (prev.finished || prev.lastGuess) return prev;
        const currentTarget = byRank.get(prev.order[prev.index]);
        if (!currentTarget) return prev;
        const distanceKm = haversineDistanceKm(coords, currentTarget);
        const points = proximityScore(distanceKm);
        return { ...prev, lastGuess: { ...coords, distanceKm, points } };
      });
    });
    // byRank is derived fresh from the stable `cities` prop each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globe, setState]);

  useEffect(() => {
    if (!globe) return;
    const points: MarkerPoint[] = [];
    if (state.lastGuess && target) {
      points.push({ lat: state.lastGuess.lat, lng: state.lastGuess.lng, color: "#2563eb" });
      points.push({ lat: target.lat, lng: target.lng, color: "#16a34a" });
    }
    globe
      .pointsData(points)
      .pointColor((p) => (p as MarkerPoint).color)
      .pointAltitude(0.01)
      .pointRadius(0.35)
      .arcsData(
        state.lastGuess && target
          ? [
              {
                startLat: state.lastGuess.lat,
                startLng: state.lastGuess.lng,
                endLat: target.lat,
                endLng: target.lng,
              },
            ]
          : []
      )
      .arcColor(() => "#f59e0b")
      .arcStroke(0.4)
      .arcDashLength(1)
      .arcDashGap(0);
  }, [globe, state.lastGuess, target]);

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
      order: shuffle(cities.map((c) => c.rank)).slice(0, ROUNDS),
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
                  Click where you think <span className="font-bold">{target?.name}</span> is
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
          <div className="flex-1 rounded-lg border border-border overflow-hidden">
            <GlobeView onReady={setGlobe} />
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
