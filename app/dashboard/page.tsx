import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-paper px-6 text-center">
      <h1 className="font-serif italic text-4xl text-ink sm:text-5xl">
        Welcome, {user.email}
      </h1>
      <p className="mt-4 font-sans text-lg text-grey">
        Your blood, your data, your story — coming soon.
      </p>
      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="border border-ink/20 px-4 py-2 font-sans text-sm text-ink transition-colors hover:border-ink"
        >
          Sign Out
        </button>
      </form>
    </main>
  );
}
