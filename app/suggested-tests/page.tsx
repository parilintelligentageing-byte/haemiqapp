import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSuggestedTestsData } from "@/lib/actions/suggested-tests";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@/lib/vitality/calculate-score";
import { TopNav } from "@/components/dashboard/top-nav";
import { TestCard } from "@/components/suggested-tests/test-card";
import { CopyListButton } from "@/components/suggested-tests/copy-list-button";

export default async function SuggestedTestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const { hasReport, totalTests, coveredCount, missingByCategory } = await getSuggestedTestsData();
  const allMissing = CATEGORY_KEYS.flatMap((key) => missingByCategory[key]);
  const coveragePercent = totalTests > 0 ? Math.round((coveredCount / totalTests) * 100) : 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-24">
      <TopNav name={profile?.name ?? "there"} />

      <Link
        href="/dashboard"
        className="mt-2 inline-block font-sans text-sm text-text-soft transition-colors hover:text-ink"
      >
        ← Back to dashboard
      </Link>

      <div className="mt-8 text-center md:text-left">
        <h1 className="font-serif text-3xl text-ink italic sm:text-4xl">What to test next</h1>
        <p className="mt-2 font-serif text-text-soft italic">
          Ask your GP for these tests to unlock a complete picture of your health.
        </p>
      </div>

      {!hasReport && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="font-serif text-xl text-ink italic">
            You haven&apos;t uploaded a blood report yet.
          </p>
          <p className="mt-2 font-sans text-sm text-text-soft">
            Here&apos;s the full recommended panel to start with — a great first blood test to ask
            your GP for.
          </p>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <p className="font-sans text-sm text-ink">
          You have <span className="font-semibold text-teal">{coveredCount}</span> of {totalTests}{" "}
          recommended biomarkers
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-teal" style={{ width: `${coveragePercent}%` }} />
        </div>
        <p className="mt-2 font-sans text-xs text-text-soft">
          Complete more tests to see your full Vitality picture.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {CATEGORY_KEYS.map((key) => {
          const tests = missingByCategory[key];
          if (tests.length === 0) return null;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-xl text-ink italic">{CATEGORY_LABELS[key]}</h2>
                <span className="font-sans text-xs font-bold tracking-[0.2em] text-gold uppercase">
                  {tests.length} missing
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                {tests.map((test) => (
                  <TestCard key={test.id} test={test} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {allMissing.length > 0 ? (
        <div className="mt-12 flex justify-center">
          <CopyListButton tests={allMissing} />
        </div>
      ) : (
        <p className="mt-12 text-center font-serif text-lg text-teal italic">
          You&apos;re covering every recommended biomarker — nice work.
        </p>
      )}
    </main>
  );
}
