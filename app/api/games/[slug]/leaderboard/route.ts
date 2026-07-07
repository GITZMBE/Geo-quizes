import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGame } from "@/lib/games/registry";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) {
    return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const modeSlug = searchParams.get("mode") ?? game.modes[0].slug;
  const modeDef = game.modes.find((m) => m.slug === modeSlug);
  if (!modeDef) {
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  }

  const gameRow = await prisma.game.findUnique({ where: { slug: game.slug } });
  if (!gameRow) {
    return NextResponse.json({ top: [] });
  }

  // POINTS: higher is better. TIME_MS: lower (faster) is better.
  const order = modeDef.scoreType === "TIME_MS" ? "asc" : "desc";

  const top = await prisma.score.findMany({
    where: { gameId: gameRow.id, mode: modeDef.slug },
    orderBy: { value: order },
    take: 10,
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ top });
}
