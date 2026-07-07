import { atom } from "nanostores";

export type RoundResult = "correct" | "wrong" | null;

export const stockholmGameState = atom({
  order: [] as string[],
  index: 0,
  score: 0,
  lastClicked: null as string | null,
  lastResult: null as RoundResult,
  finished: false,
});

export const swedenTypeAllState = atom({
  guessedRanks: [] as number[],
  startedAt: null as number | null,
  finishedAt: null as number | null,
  gaveUp: false,
});

export const swedenClickDotState = atom({
  order: [] as number[],
  index: 0,
  score: 0,
  lastClicked: null as number | null,
  lastResult: null as RoundResult,
  finished: false,
});

export const swedenProximityState = atom({
  order: [] as number[],
  index: 0,
  totalScore: 0,
  lastGuess: null as { lat: number; lng: number; distanceKm: number; points: number } | null,
  finished: false,
});

export const worldProximityState = atom({
  order: [] as string[],
  index: 0,
  totalScore: 0,
  lastGuess: null as { lat: number; lng: number; distanceKm: number; points: number } | null,
  finished: false,
});
