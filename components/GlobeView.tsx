"use client";

import { forwardRef, useEffect, useRef, useState, type MutableRefObject } from "react";
import ReactGlobe, { type GlobeMethods, type GlobeProps } from "react-globe.gl";

// Thin sizing wrapper around react-globe.gl — the maintained React binding
// for globe.gl. An earlier version hand-rolled globe.gl's imperative
// Kapsule API directly (manual container ref + `new Globe(container)` in a
// useEffect), which hit repeated DOM-lifecycle races (constructing against a
// container that was null/detached). react-globe.gl handles all of that
// correctly internally — pass layer data/config as props (polygonsData,
// pointColor, onPolygonClick, etc.) instead of calling methods imperatively;
// use the forwarded ref only for the few ref-only methods (pointOfView,
// controls()).
export const GlobeView = forwardRef<GlobeMethods, GlobeProps>(function GlobeView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.width > 0 && size.height > 0 && (
        <ReactGlobe
          // react-globe.gl's own .d.ts types its ref as MutableRefObject
          // rather than the standard React.Ref shape forwardRef provides;
          // every consumer here only ever passes a plain useRef(null), so
          // this cast reflects the actual (narrower) usage safely.
          ref={ref as MutableRefObject<GlobeMethods | undefined> | undefined}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          {...props}
        />
      )}
    </div>
  );
});
