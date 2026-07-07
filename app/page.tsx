import Link from "next/link";
import { auth, signIn, signOut } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Geo Quiz</h1>
      <p className="max-w-md text-muted-foreground">
        Test your geography knowledge with interactive map quizzes.
      </p>

      {session?.user ? (
        <div className="flex flex-col items-center gap-4">
          <p>
            Signed in as{" "}
            <span className="font-medium">{session.user.name ?? session.user.email}</span>
          </p>
          <Link
            href="/games"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Play Games
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button
              type="submit"
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in with Google
          </button>
        </form>
      )}
    </main>
  );
}
