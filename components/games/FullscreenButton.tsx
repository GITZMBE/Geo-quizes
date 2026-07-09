"use client";

import { useEffect, useState, type RefObject } from "react";

// Generic Fullscreen API toggle for a game's map/globe container — the
// browser natively resizes the target element to fill the viewport, and
// GlobeView/MapView already resize themselves via ResizeObserver, so no
// extra plumbing is needed on the caller's side beyond passing the ref.
export function FullscreenButton({
  targetRef,
  autoEnter = false,
}: {
  targetRef: RefObject<HTMLElement | null>;
  // Requests fullscreen once on mount rather than waiting for a manual
  // click — for a game where the map/globe should always fill the screen.
  // Mounting only happens right after the player presses GameShell's
  // Start button, so this is still within that click's user-activation
  // window in practice; browsers that reject an unsolicited call anyway
  // just leave this button as the fallback.
  autoEnter?: boolean;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(document.fullscreenElement === targetRef.current);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [targetRef]);

  useEffect(() => {
    if (autoEnter) targetRef.current?.requestFullscreen().catch(() => {});
  }, [autoEnter, targetRef]);

  function toggle() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      targetRef.current?.requestFullscreen();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="absolute right-3 top-3 z-10 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted"
    >
      {isFullscreen ? "Exit full screen" : "Full screen"}
    </button>
  );
}
