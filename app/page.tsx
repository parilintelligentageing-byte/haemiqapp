import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CinematicSplit } from "@/components/marketing/cinematic-split";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <CinematicSplit>
      <div className="flex flex-col items-center gap-8 text-center">
        <p className="font-serif text-lg italic text-text-soft">
          Read your body&apos;s signal.
        </p>
        <div className="flex w-full flex-col gap-4">
          <Link
            href="/signup"
            className="w-full rounded-full bg-teal px-4 py-3 text-center font-sans text-sm font-semibold tracking-wide text-paper uppercase transition-colors hover:bg-ink"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="w-full rounded-full border border-teal px-4 py-3 text-center font-sans text-sm font-semibold tracking-wide text-teal uppercase transition-colors hover:bg-teal hover:text-paper"
          >
            Sign In
          </Link>
        </div>
      </div>
    </CinematicSplit>
  );
}
