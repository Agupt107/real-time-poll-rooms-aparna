import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <main className="w-full max-w-md text-center">
        <h1 className="mb-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
          Real-Time Poll
        </h1>
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          Create a poll and see results update live.
        </p>
        <Link
          href="/create"
          className="inline-block rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Create a poll
        </Link>
      </main>
    </div>
  );
}
