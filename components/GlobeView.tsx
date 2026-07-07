"use client";

import { useEffect, useRef } from "react";
import Globe, { type GlobeInstance } from "globe.gl";

type GlobeViewProps = {
  onReady?: (globe: GlobeInstance) => void;
};

// Thin wrapper around globe.gl (not a React component itself) — mounts a globe
// into `containerRef` and hands the controller instance back via onReady so
// game pages can configure polygons/points/click handlers as needed.
//
// globe.gl is imported statically (not via a nested dynamic import) — this
// component is only ever rendered from inside StockholmGame/ClickDotMode/
// ProximityMode, which are themselves loaded via next/dynamic({ssr:false}),
// so SSR safety is already handled at that level. An earlier version did a
// nested `import("globe.gl")` here, which opened a window between mount and
// the import resolving during which the container could unmount (e.g. the
// user switching game mode tabs) — globe.gl's init() unconditionally does
// `domNode.innerHTML = ""`, which throws on a null/detached node. A static
// import makes construction synchronous within the effect, closing that gap.
export function GlobeView({ onReady }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const globe = new Globe(container)
      .backgroundColor("rgba(0,0,0,0)")
      .width(container.clientWidth)
      .height(container.clientHeight);
    onReadyRef.current?.(globe);

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      globe.width(width).height(height);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      globe._destructor?.();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
