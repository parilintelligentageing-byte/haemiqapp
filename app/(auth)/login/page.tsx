import Link from "next/link";
import { login } from "@/lib/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-[32px] italic text-ink">
          Welcome back
        </h1>
        <p className="mt-2 font-serif italic text-text-soft">
          Sign in to continue your journey.
        </p>
      </div>

      <form action={login} className="space-y-6">
        <div>
          <label
            htmlFor="email"
            className="block font-sans text-[11px] tracking-widest text-text-soft uppercase"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-2 w-full border-0 border-b border-line bg-transparent py-1.5 font-sans text-ink focus:border-teal focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block font-sans text-[11px] tracking-widest text-text-soft uppercase"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-2 w-full border-0 border-b border-line bg-transparent py-1.5 font-sans text-ink focus:border-teal focus:outline-none"
          />
        </div>

        {error && <p className="font-sans text-sm text-alert">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-full bg-teal px-4 py-3 font-sans text-sm font-semibold tracking-wide text-paper uppercase transition-colors hover:bg-ink"
        >
          Sign In
        </button>
      </form>

      <p className="mt-8 text-center font-sans text-sm text-text-soft">
        No account yet?{" "}
        <Link href="/signup" className="text-gold hover:underline">
          Get started
        </Link>
      </p>
    </div>
  );
}
