import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGame } from "@/lib/games/registry";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { gameSlug, mode, value } = body as {
    gameSlug?: string;
    mode?: string;
    value?: number;
  };

  const game = gameSlug ? getGame(gameSlug) : undefined;
  const modeDef = game?.modes.find((m) => m.slug === mode);

  if (!game || !modeDef || typeof value !== "number") {
    return NextResponse.json({ error: "Invalid score payload" }, { status: 400 });
  }

  const gameRow = await prisma.game.upsert({
    where: { slug: game.slug },
    update: {},
    create: { slug: game.slug, name: game.name },
  });

  const score = await prisma.score.create({
    data: {
      userId: session.user.id,
      gameId: gameRow.id,
      mode: modeDef.slug,
      type: modeDef.scoreType,
      value,
    },
  });

  return NextResponse.json({ score }, { status: 201 });
}
