import { useStore } from "@nanostores/react";
import type { WritableAtom } from "nanostores";

// Mirrors useRecoilState's [state, setState] shape (setState accepts either
// a value or an updater function) so game components didn't need to change
// beyond the import — this was swapped in after Recoil turned out to be
// fundamentally incompatible with React 19 (it reaches into a React
// internals object whose shape changed), not just a build-time SSR issue.
export function useGameState<T>(store: WritableAtom<T>) {
  const state = useStore(store);

  function setState(next: T | ((prev: T) => T)) {
    store.set(typeof next === "function" ? (next as (prev: T) => T)(store.get()) : next);
  }

  return [state, setState] as const;
}
