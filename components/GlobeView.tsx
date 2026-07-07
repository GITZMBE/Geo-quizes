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
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!containerRef.current) return;

    let globe: GlobeInstance | undefined;
    let cancelled = false;

    import("globe.gl").then(({ default: Globe }) => {
      // Re-check freshly (not the value captured above) — by the time this
      // async import resolves, the component may have unmounted (e.g. the
      // user switched game mode tabs) and the container detached from the
      // document. globe.gl's init() unconditionally does
      // `domNode.innerHTML = ""`, which throws on a null/detached node.
      const container = containerRef.current;
      if (cancelled || !container || !container.isConnected) return;

      try {
        globe = new Globe(container)
          .backgroundColor("rgba(0,0,0,0)")
          .width(container.clientWidth)
          .height(container.clientHeight);
      } catch (err) {
        console.error("GlobeView: failed to initialize globe.gl", err);
        return;
      }
      onReadyRef.current?.(globe);
    });

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      globe?.width(width).height(height);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      globe?._destructor?.();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
