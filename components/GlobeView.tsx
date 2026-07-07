"use client";

import { useEffect, useRef } from "react";
import type { GlobeInstance } from "globe.gl";

type GlobeViewProps = {
  onReady?: (globe: GlobeInstance) => void;
};

// Thin wrapper around globe.gl (not a React component itself) — mounts a globe
// into `containerRef` and hands the controller instance back via onReady so
// game pages can configure polygons/points/click handlers as needed.
export function GlobeView({ onReady }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let globe: GlobeInstance | undefined;
    let cancelled = false;

    import("globe.gl").then(({ default: Globe }) => {
      if (cancelled || !containerRef.current) return;
      globe = new Globe(containerRef.current).backgroundColor("rgba(0,0,0,0)");
      onReady?.(globe);
    });

    return () => {
      cancelled = true;
      globe?._destructor?.();
    };
  }, [onReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}
