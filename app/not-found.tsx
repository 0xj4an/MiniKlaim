import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="text-sm text-zinc-600">
        We couldn&apos;t find that page.
      </p>
      <Link
        href="/"
        className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Go home
      </Link>
    </main>
  );
}
