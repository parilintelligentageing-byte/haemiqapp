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
      <div className="mb-10 text-center">
        <span
          aria-hidden
          className="mb-4 inline-block h-2 w-2 rounded-full bg-blood"
        />
        <h1 className="font-serif italic text-4xl text-ink">Welcome back</h1>
        <p className="mt-2 font-sans text-sm text-grey">
          Sign in to your Haemiq account.
        </p>
      </div>

      <form action={login} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block font-sans text-sm text-ink"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full border border-ink/20 bg-paper px-3 py-2 font-sans text-ink focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block font-sans text-sm text-ink"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full border border-ink/20 bg-paper px-3 py-2 font-sans text-ink focus:border-ink focus:outline-none"
          />
        </div>

        {error && (
          <p className="font-sans text-sm text-blood">{error}</p>
        )}

        <button
          type="submit"
          className="w-full bg-blood px-4 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Sign In
        </button>
      </form>

      <p className="mt-6 text-center font-sans text-sm text-grey">
        No account yet?{" "}
        <Link href="/signup" className="text-ink underline underline-offset-2">
          Get started
        </Link>
      </p>
    </div>
  );
}
