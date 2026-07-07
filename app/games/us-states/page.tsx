"use client";

import dynamic from "next/dynamic";

// This game uses browser-only APIs (globe.gl) and is behind login with no
// SEO value, so there's nothing gained from prerendering it.
const USStatesGame = dynamic(() => import("./USStatesGame"), {
  ssr: false,
  loading: () => <p className="p-8 text-muted-foreground">Loading...</p>,
});

export default function USStatesPage() {
  return <USStatesGame />;
}
