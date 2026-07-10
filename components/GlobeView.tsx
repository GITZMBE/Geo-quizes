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
// The globe's zoom floor (three-globe's default OrbitControls.minDistance
// sits right at the surface) lets the camera get closer than the earth
// texture has detail for — past this distance it stretches blurry across
// the viewport. Raising the floor keeps zoom useful for gameplay without
// crossing into that blur. Self-hosted (not hotlinked) because NASA's
// eoimages server doesn't send CORS headers, which three.js's TextureLoader
// requires for WebGL — a bare cross-origin <img> works fine, but
// texImage2D throws SecurityError without them.
//
// 150 is a proportional extrapolation from two previously-verified data
// points on the old 4096px-wide texture (150 = visibly blurry, 220 =
// crisp), scaled up to this texture's 5400px width: crisp floor
// 220/(5400/4096) ≈ 167 (rounds to the previous 170), blurry floor
// 150/(5400/4096) ≈ 114. 150 sits closer to the blurry end than 170 did,
// trading some of that safety margin for more usable zoom — paired with
// the anisotropic filtering below, which sharpens the grazing-angle portion
// of the view (most of the screen once zoomed in close and looking toward
// the horizon rather than straight down) at this closer distance too.
// Unlike the 170 value, 150 has not been visually re-verified in a browser
// (see commit description) — worth a quick look if it turns out too soft.
const MIN_ZOOM_DISTANCE = 150;
const EARTH_TEXTURE_URL = "/textures/earth-blue-marble-5400.jpg";

export const GlobeView = forwardRef<GlobeMethods, GlobeProps>(function GlobeView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // react-globe.gl's own .d.ts types its ref as MutableRefObject rather
  // than the standard React.Ref shape forwardRef provides; every consumer
  // here only ever passes a plain useRef(null), so this cast reflects the
  // actual (narrower) usage safely — and lets this component read the
  // globe instance back off the same ref it forwards to ReactGlobe.
  const globeRef = ref as MutableRefObject<GlobeMethods | undefined> | null;

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

  function handleGlobeReady() {
    const controls = globeRef?.current?.controls();
    if (controls) controls.minDistance = MIN_ZOOM_DISTANCE;
    applyMaxAnisotropy();
    props.onGlobeReady?.();
  }

  // three-globe's own TextureLoader leaves anisotropic filtering at three.js's
  // default of 1, which blurs the surface further at a grazing viewing angle
  // — the angle most of the visible surface is at once zoomed in close (only
  // the point directly under the camera is straight-on). three-globe tags its
  // globe group with `__globeObjType === "globe"` (confirmed by reading
  // three-globe's stateInit — there's no public accessor for it; `globeMaterial`
  // is only settable as a prop, not exposed as one of react-globe.gl's
  // forwarded ref methods). The texture itself loads asynchronously after
  // that mesh already exists, so poll briefly for `.map` to appear rather
  // than assuming it's already there by the time onGlobeReady fires.
  //
  // Untyped structural casts throughout, not `Mesh`/`MeshPhongMaterial` from
  // "three" — this project has no `@types/three`, and "three" ships no
  // declaration file resolvable from a direct import in app code (confirmed:
  // importing `Mesh`/`MeshPhongMaterial` from "three" here broke `tsc`, even
  // though the `renderer()`/`scene()` calls above type-check fine as their
  // react-globe.gl-declared return types).
  function applyMaxAnisotropy() {
    const renderer = globeRef?.current?.renderer();
    const scene = globeRef?.current?.scene();
    if (!renderer || !scene) return;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    let attempts = 0;
    const tryApply = () => {
      const globeGroup = scene.children.find(
        (obj: unknown) => (obj as { __globeObjType?: string }).__globeObjType === "globe"
      );
      const globeMesh = (globeGroup as unknown as { children: unknown[] } | undefined)?.children.find(
        (obj: unknown) => (obj as { isMesh?: boolean }).isMesh
      );
      const material = (globeMesh as unknown as { material?: { map?: { anisotropy: number; needsUpdate: boolean } } })
        ?.material;
      const map = material?.map;
      if (map) {
        map.anisotropy = maxAnisotropy;
        map.needsUpdate = true;
      } else if (attempts++ < 30) {
        setTimeout(tryApply, 100);
      }
    };
    tryApply();
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      {size.width > 0 && size.height > 0 && (
        <ReactGlobe
          ref={globeRef ?? undefined}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          // Without a globeImageUrl, three-globe's default material is
          // flat black (see defaultGlobeMaterial in three-globe/src/layers/globe.js)
          // — every caller here relies on this default rather than passing
          // its own, so it lives here instead of being repeated 3x.
          globeImageUrl={EARTH_TEXTURE_URL}
          {...props}
          onGlobeReady={handleGlobeReady}
        />
      )}
    </div>
  );
});
