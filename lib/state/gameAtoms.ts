import { atom } from "nanostores";

export type RoundResult = "correct" | "wrong" | null;

export const stockholmGameState = atom({
  order: [] as string[],
  index: 0,
  score: 0,
  lastClicked: null as string | null,
  lastResult: null as RoundResult,
  // Every wrongly-clicked district name so far this game, so a miss keeps
  // showing red for the rest of the game rather than just the brief
  // feedback window.
  wrongGuesses: [] as string[],
  // Every correctly-clicked district name so far this game, so a hit keeps
  // showing green for the rest of the game rather than just the brief
  // feedback window.
  correctGuesses: [] as string[],
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

export const usStatesGameState = atom({
  order: [] as string[],
  index: 0,
  score: 0,
  lastClicked: null as string | null,
  lastResult: null as RoundResult,
  // Every wrongly-clicked state name so far this game, so a miss keeps
  // showing red for the rest of the game rather than just the brief
  // feedback window.
  wrongGuesses: [] as string[],
  // Every correctly-clicked state name so far this game, so a hit keeps
  // showing green for the rest of the game rather than just the brief
  // feedback window.
  correctGuesses: [] as string[],
  finished: false,
});

export const worldCountriesTypeAllState = atom({
  guessedIds: [] as string[],
  startedAt: null as number | null,
  finishedAt: null as number | null,
  gaveUp: false,
});

export type RoundGameState = {
  order: string[];
  index: number;
  score: number;
  lastAnswer: string | null;
  lastResult: RoundResult;
  // Every wrong answer so far this game (region name, capital, or country
  // name depending on mode), so a miss keeps showing red for the rest of
  // the game rather than just the brief feedback window.
  wrongGuesses: string[];
  // Every correct answer so far this game, so a hit keeps showing green
  // for the rest of the game rather than just the brief feedback window.
  correctGuesses: string[];
  finished: boolean;
};

const DEFAULT_ROUND_STATE: RoundGameState = {
  order: [],
  index: 0,
  score: 0,
  lastAnswer: null,
  lastResult: null,
  wrongGuesses: [],
  correctGuesses: [],
  finished: false,
};

// The per-continent Countries/Capitals/Flags modes (see useRoundGame.ts)
// are 18 independent instances (6 continents x 3 modes) of the exact same
// round shape already used by stockholmGameState/usStatesGameState above —
// a factory + cache avoids hand-declaring 18 near-identical exports here,
// while still giving each game+mode its own persistent atom (so switching
// mode tabs and back doesn't lose progress, same as the hand-declared ones).
const roundStateCache = new Map<string, ReturnType<typeof atom<RoundGameState>>>();

export function getRoundState(key: string) {
  let state = roundStateCache.get(key);
  if (!state) {
    state = atom({ ...DEFAULT_ROUND_STATE });
    roundStateCache.set(key, state);
  }
  return state;
}
