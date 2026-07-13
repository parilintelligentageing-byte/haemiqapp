import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-paper px-6 text-center">
      <h1 className="font-serif italic text-5xl text-ink sm:text-6xl">
        Haemiq · Setup Complete
      </h1>
      <p className="mt-4 font-sans text-lg text-grey">
        The foundation is ready. Insights and meal plans come next.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <Link
          href="/login"
          className="font-sans text-sm text-ink underline underline-offset-2"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="bg-blood px-5 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Get Started
        </Link>
      </div>
    </main>
  );
}
