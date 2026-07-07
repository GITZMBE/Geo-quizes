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
//
// The measuring container is `absolute inset-0`, not `h-full w-full`: every
// caller sizes it via a `flex-1` wrapper, and a `flex-1` item's height comes
// from flex-grow rather than a specified value, so a percentage-height
// child can't reliably resolve against it (circular auto-height dependency)
// — it measures 0 in practice. Absolute positioning resolves against the
// nearest positioned ancestor's actual box instead, so callers just need
// `relative` on that wrapper.
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
    <div ref={containerRef} className="absolute inset-0">
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
          // Without a globeImageUrl, three-globe's default material is
          // flat black (see defaultGlobeMaterial in three-globe/src/layers/globe.js)
          // — every caller here relies on this default rather than passing
          // its own, so it lives here instead of being repeated 3x.
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          {...props}
        />
      )}
    </div>
  );
});
