import { GlobeView } from "@/components/GlobeView";

export default function StockholmStadsdelarPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Stockholm Districts</h1>
      <p className="text-muted-foreground">
        A district name will appear below — click its outline on the map.
      </p>

      {/* TODO: prompt bar showing the target district, points, and feedback */}
      <div className="flex-1 rounded-lg border border-border overflow-hidden">
        <GlobeView />
      </div>
    </main>
  );
}
