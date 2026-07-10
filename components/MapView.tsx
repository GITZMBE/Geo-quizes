"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
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

const MIN_SCALE = 1;
const MAX_SCALE = 10;
const WHEEL_ZOOM_FACTOR = 1.2;
const BUTTON_ZOOM_FACTOR = 1.5;

// Below this projected area (px², computed once per projection/container
// size, not on every zoom/pan), a region is too small to click reliably at
// the default zoom level — Vatican City, Singapore, Rhode Island, etc.
// Rendering a circle marker at its centroid guarantees a clickable target
// without requiring the player to zoom in first.
//
// This has to be an area check, not a bounding-box check (the original
// approach): a scattered-island nation's bounding box spans the gaps
// between its islands, not how much of them is actually visible — Kiribati,
// Micronesia, Marshall Islands, Palau, and Tonga all have a large enough
// bounding box to pass a size check while every individual island renders
// as a sub-pixel dot (confirmed by computing both for every country: e.g.
// Micronesia's bbox is ~210x60px but its total projected area is ~3px²).
const SMALL_REGION_AREA_PX = 60;
const SMALL_REGION_MARKER_RADIUS = 5;

type Transform = { x: number; y: number; k: number };
const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, k: 1 };

function clampScale(k: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

// Bounds x/y so the content (roughly width*k by height*k, post-fitSize) never
// pans past its own edges — panning was previously unbounded, so a drag
// while zoomed in could push the translate arbitrarily far in any
// direction; zooming back out afterward scaled that same stale offset down
// proportionally (to keep the pinch/cursor point fixed) instead of
// re-centering, so it never actually returned to 0 on its own. At k===1
// (MIN_SCALE) this collapses to exactly {x: 0, y: 0} since minX/minY are 0
// there, which is what re-anchors the map back to identity once zoomed
// fully out, restoring the areas that had panned out of the viewport.
function clampTranslate(x: number, y: number, k: number, width: number, height: number) {
  const minX = width - width * k;
  const minY = height - height * k;
  return {
    x: Math.min(0, Math.max(minX, x)),
    y: Math.min(0, Math.max(minY, y)),
  };
}

// geoAlbersUsa's internal clipExtent leaks a full-canvas rectangle into the
// start of every feature's "d" string (confirmed: all 50 US states have it,
// not just a few). That's invisible when a whole country/state collection
// is merged into one <path> with one fill — the rectangle's winding cancels
// against its neighbors — but every region here is its own <path> (needed
// for independent per-region click/fill), so the leaked rectangle renders
// as a full-viewport fill on its own: with the default nonzero fill rule
// every region's rectangle fills the whole map solid; under evenodd (needed
// for Canada's multi-ring Arctic islands, see the fillRule comment below)
// each region's rectangle fills solid *except* a hole punched at that
// region's own shape — confirmed by clicking a wrong US state and watching
// the entire map flash solid red. The rectangle is always the first
// subpath and always a simple axis-aligned box (4 points + close), so it's
// safe to strip structurally rather than special-case by projection.
// Not just leading — for a MultiPolygon under albersUsa (Alaska, Hawaii),
// a clip rectangle gets re-inserted as its own subpath between *each* real
// island ring, apparently once per transition across the composite
// projection's 3 sub-region boundaries (confirmed: Alaska's 4 real island
// subpaths are interleaved with rectangle subpaths for all 3 of the main
// map's extent, Hawaii's inset box, and Alaska's own inset box — 7 of
// Alaska's 10 total subpaths are these rectangles). So this splits into
// subpaths and drops every one that's exactly a closed axis-aligned
// rectangle, rather than only stripping a leading run of them.
const CLIP_RECTANGLE = /^M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),\2L\3,(-?[\d.]+)L\1,\4Z$/;
function stripClipRectangle(d: string | null): string | undefined {
  if (!d) return undefined;
  return d
    .split(/(?=M)/)
    .filter((subpath) => !CLIP_RECTANGLE.test(subpath))
    .join("");
}

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
  const [transform, setTransform] = useState<Transform>(IDENTITY_TRANSFORM);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(
    null
  );
  // Every currently-down pointer, keyed by pointerId — a single entry is a
  // drag-to-pan (only once already zoomed, same as before); two entries is
  // a pinch, recomputed incrementally each move from the previous frame's
  // distance/midpoint rather than a single gesture-start reference, so a
  // pinch that also drifts sideways pans and zooms together naturally.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number } | null>(null);

  // A previous round's zoom/pan shouldn't carry over onto a different
  // region set (new game, or a fresh shuffle) — reset whenever the data
  // identity changes. Adjusting state during render (React's documented
  // pattern for this — see "you might not need an effect") rather than in
  // a useEffect, which React 19's stricter lint flags as a
  // cascading-render risk when setState is called unconditionally in an
  // effect body.
  const [prevRegionsData, setPrevRegionsData] = useState(regionsData);
  if (regionsData !== prevRegionsData) {
    setPrevRegionsData(regionsData);
    setTransform(IDENTITY_TRANSFORM);
  }

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

  // Computed once per projection (not on every zoom/pan) so a marker
  // doesn't disappear just because the user zoomed in past the point
  // where the polygon itself would technically be clickable.
  const smallRegions = useMemo(() => {
    if (!pathFor) return [];
    return regionsData.flatMap((feature) => {
      const totalArea = pathFor.area(feature as unknown as GeoPermissibleObjects);
      if (totalArea >= SMALL_REGION_AREA_PX) return [];

      // A scattered-island nation's own centroid can land in open water
      // (its islands' bounding box spans the gaps between them, and the
      // centroid is pulled toward whichever part has the most vertices) —
      // anchor the marker on the centroid of its single largest part
      // instead, which is always inside actual territory.
      const geometry = feature.geometry;
      const parts =
        geometry.type === "MultiPolygon"
          ? (geometry.coordinates as unknown[])
          : [geometry.coordinates];
      let best: { area: number; centroid: [number, number] } | null = null;
      for (const part of parts) {
        const polygon = { type: "Polygon", coordinates: part } as unknown as GeoPermissibleObjects;
        const area = pathFor.area(polygon);
        if (!best || area > best.area) {
          best = { area, centroid: pathFor.centroid(polygon) };
        }
      }
      if (!best || Number.isNaN(best.centroid[0]) || Number.isNaN(best.centroid[1])) return [];
      return [{ feature, x: best.centroid[0], y: best.centroid[1] }];
    });
  }, [pathFor, regionsData]);

  function zoomBy(factor: number, center?: { x: number; y: number }) {
    setTransform((prev) => {
      const nextK = clampScale(prev.k * factor);
      if (nextK === prev.k) return prev;
      const cx = center?.x ?? size.width / 2;
      const cy = center?.y ?? size.height / 2;
      // Keep the point under the cursor (or the container's center, for
      // button clicks) fixed on screen while scaling.
      const rawX = cx - ((cx - prev.x) / prev.k) * nextK;
      const rawY = cy - ((cy - prev.y) / prev.k) * nextK;
      return { k: nextK, ...clampTranslate(rawX, rawY, nextK, size.width, size.height) };
    });
  }

  function handleWheel(e: WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // A second finger just landed — cancel any single-finger pan and
      // switch to pinch mode instead.
      dragRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (pointersRef.current.size > 2) return;

    if (transform.k <= 1) return;
    // Only capture the pointer once a drag (already zoomed) or pinch is
    // actually starting, not on every pointerdown — capturing
    // unconditionally retargeted the browser's synthesized "click" away
    // from the individual region <path> under the finger/cursor, breaking
    // click-to-guess entirely even at the default (unzoomed) scale.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: transform.x,
      originY: transform.y,
    };
  }

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      const scaleFactor = distance / pinchRef.current.distance;
      zoomBy(scaleFactor, { x: midX, y: midY });
      pinchRef.current = { distance };
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setTransform((prev) => ({
      ...prev,
      ...clampTranslate(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY),
        prev.k,
        size.width,
        size.height
      ),
    }));
  }

  function endDrag(e: PointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const zoomed = transform.k > 1;

  return (
    <div ref={containerRef} className="absolute inset-0 bg-surface">
      {pathFor && (
        <>
          <svg
            width={size.width}
            height={size.height}
            className={zoomed ? "block cursor-grab touch-none active:cursor-grabbing" : "block touch-none"}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onPointerCancel={endDrag}
          >
            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
              {regionsData.map((feature, i) => (
                <path
                  key={i}
                  d={stripClipRectangle(pathFor(feature as unknown as GeoPermissibleObjects))}
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
                  vectorEffect="non-scaling-stroke"
                  onClick={() => onRegionClick?.(feature)}
                  className={onRegionClick ? "cursor-pointer" : undefined}
                >
                  {label && <title>{label(feature)}</title>}
                </path>
              ))}
              {smallRegions.map(({ feature, x, y }, i) => (
                <circle
                  key={`marker-${i}`}
                  cx={x}
                  cy={y}
                  r={SMALL_REGION_MARKER_RADIUS / transform.k}
                  fill={fill(feature)}
                  stroke={stroke(feature)}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => onRegionClick?.(feature)}
                  className={onRegionClick ? "cursor-pointer" : undefined}
                >
                  {label && <title>{label(feature)}</title>}
                </circle>
              ))}
            </g>
          </svg>
          <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => zoomBy(BUTTON_ZOOM_FACTOR)}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-lg font-medium leading-none text-foreground shadow-sm hover:bg-muted"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-lg font-medium leading-none text-foreground shadow-sm hover:bg-muted"
              aria-label="Zoom out"
            >
              −
            </button>
            {zoomed && (
              <button
                type="button"
                onClick={() => setTransform(IDENTITY_TRANSFORM)}
                className="pointer-events-auto rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
              >
                Reset
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
