import { useEffect, useRef } from "react";
import { useGameState } from "@/lib/state/useGameState";
import { getRoundState } from "@/lib/state/gameAtoms";
import { getGame } from "@/lib/games/registry";
import { shuffle } from "@/lib/games/geo";
import { submitScore } from "@/lib/games/scores";

// Shared round-progression scaffolding for the per-continent Countries
// (click-a-map), Capitals, and Flags modes — all three are "one target at a
// time, guess it, brief feedback, advance, POINTS across one full pass"
// (the same shape as StockholmGame/USStatesGame), just with the answer
// coming from a click vs. a text guess. Extracted here because 3 shared
// mode components need this identical scaffolding, not duplicated 18 times
// across 6 continents; StockholmGame/USStatesGame predate this and are left
// as-is rather than retrofitted.
export function useRoundGame<T>({
  gameSlug,
  modeSlug,
  items,
  getId,
  feedbackDelayMs = 900,
}: {
  gameSlug: string;
  modeSlug: string;
  items: T[];
  getId: (item: T) => string;
  feedbackDelayMs?: number;
}) {
  const game = getGame(gameSlug)!;
  const mode = game.modes.find((m) => m.slug === modeSlug)!;
  const [state, setState] = useGameState(getRoundState(`${gameSlug}:${modeSlug}`));
  const submittedRef = useRef(false);

  useEffect(() => {
    if (state.order.length === 0 && items.length > 0) {
      setState({
        order: shuffle(items.map(getId)),
        index: 0,
        score: 0,
        lastAnswer: null,
        lastResult: null,
        wrongGuesses: [],
        correctGuesses: [],
        finished: false,
      });
    }
    // getId is a fresh closure per render in every caller; including it
    // would refire this setup effect every render (same trap as the
    // Stockholm reshuffle bug), so it's intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, state.order.length, setState]);

  useEffect(() => {
    if (!state.lastResult) return;
    const timeout = setTimeout(() => {
      setState((prev) => {
        const nextIndex = prev.index + 1;
        const finished = nextIndex >= prev.order.length;
        return { ...prev, index: nextIndex, finished, lastAnswer: null, lastResult: null };
      });
    }, feedbackDelayMs);
    return () => clearTimeout(timeout);
  }, [state.lastResult, setState, feedbackDelayMs]);

  useEffect(() => {
    if (state.finished && !submittedRef.current) {
      submittedRef.current = true;
      submitScore(gameSlug, modeSlug, state.score).catch(() => {});
    }
  }, [state.finished, state.score, gameSlug, modeSlug]);

  function submitGuess(answer: string, isCorrect: boolean) {
    setState((prev) => {
      if (prev.finished || prev.lastResult) return prev;
      return {
        ...prev,
        lastAnswer: answer,
        lastResult: isCorrect ? "correct" : "wrong",
        score: isCorrect ? prev.score + 1 : prev.score,
        wrongGuesses: !isCorrect && !prev.wrongGuesses.includes(answer)
          ? [...prev.wrongGuesses, answer]
          : prev.wrongGuesses,
        correctGuesses: isCorrect && !prev.correctGuesses.includes(answer)
          ? [...prev.correctGuesses, answer]
          : prev.correctGuesses,
      };
    });
  }

  function playAgain() {
    submittedRef.current = false;
    setState({
      order: shuffle(items.map(getId)),
      index: 0,
      score: 0,
      lastAnswer: null,
      lastResult: null,
      wrongGuesses: [],
      correctGuesses: [],
      finished: false,
    });
  }

  return { game, mode, state, target: state.order[state.index], submitGuess, playAgain };
}
