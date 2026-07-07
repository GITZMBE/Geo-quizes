"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { RegionFeature } from "@/lib/games/data";

// Thin sizing + projection wrapper for click-a-region games — a flat 2D
// map instead of GlobeView's 3D globe. Region games (Stockholm districts,
// US states, and per-continent country outlines) are all click-precision
// tasks where a flat projection is easier to click accurately than a
// rotatable sphere, and sidesteps globe-only problems entirely (camera
// framing for geographically split regions like Alaska/Hawaii,
// rotation-lock tradeoffs, and the three-globe polygon-cap transparency
// bug documented on GlobeView's US States gotcha in CLAUDE.md). GlobeView
// stays in use for the point-based "guess the location" games, where a
// sphere is the more honest representation of the task.
//
// Sized the same way as GlobeView (`absolute inset-0` inside a `relative`
// caller) for the same reason: callers use a `flex-1` wrapper, and a
// percentage-height child can't reliably resolve against a flex-grow
// height.
type MapViewProps<T extends RegionFeature> = {
  regionsData: T[];
  // "pacific" is a Mercator rotated 180° so the antimeridian seam falls
  // over the Atlantic instead of through the Pacific — Oceania's own
  // countries straddle it (Fiji's islands span -180..180, Kiribati
  // -171.7..174.8), which otherwise blows up fitSize's bounding box to
  // ~360° of longitude and squeezes every country into a sliver.
  projection?: "mercator" | "albersUsa" | "pacific";
  fill: (feature: T) => string;
  stroke: (feature: T) => string;
  onRegionClick?: (feature: T) => void;
  label?: (feature: T) => string;
};

export function MapView<T extends RegionFeature>({
  regionsData,
  projection = "mercator",
  fill,
  stroke,
  onRegionClick,
  label,
}: MapViewProps<T>) {
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

  const pathFor = useMemo(() => {
    if (size.width === 0 || size.height === 0) return null;
    const featureCollection = {
      type: "FeatureCollection" as const,
      features: regionsData,
    };
    const proj =
      projection === "albersUsa"
        ? geoAlbersUsa()
        : projection === "pacific"
          ? geoMercator().rotate([180, 0])
          : geoMercator();
    proj.fitSize([size.width, size.height], featureCollection as unknown as GeoPermissibleObjects);
    return geoPath(proj);
  }, [regionsData, size.width, size.height, projection]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {pathFor && (
        <svg width={size.width} height={size.height} className="block">
          {regionsData.map((feature, i) => (
            <path
              key={i}
              d={pathFor(feature as unknown as GeoPermissibleObjects) ?? undefined}
              fill={fill(feature)}
              // evenodd, not the SVG default nonzero: a MultiPolygon whose
              // separate (disjoint, non-nested) rings don't all share the
              // same winding direction — real-world GeoJSON isn't always
              // consistent, e.g. Canada's Arctic archipelago — renders
              // some rings as unfilled "holes" under nonzero. evenodd
              // fills every disjoint ring regardless of winding; it only
              // differs from nonzero for genuinely nested rings (holes),
              // which none of this app's country/region data has.
              fillRule="evenodd"
              stroke={stroke(feature)}
              strokeWidth={1}
              strokeLinejoin="round"
              onClick={() => onRegionClick?.(feature)}
              className={onRegionClick ? "cursor-pointer" : undefined}
            >
              {label && <title>{label(feature)}</title>}
            </path>
          ))}
        </svg>
      )}
    </div>
  );
}
