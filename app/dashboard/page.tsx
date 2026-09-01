import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { getBloodReports } from "@/lib/actions/blood-reports";
import { UploadReportForm } from "@/components/blood-reports/upload-report-form";
import { ReportsList } from "@/components/blood-reports/reports-list";
import { TopNav } from "@/components/dashboard/top-nav";
import { Greeting } from "@/components/dashboard/greeting";
import { VitalitySection } from "@/components/vitality/vitality-section";
import { VitalityHeroSkeleton } from "@/components/vitality/vitality-hero";
import { ComingSoon } from "@/components/vitality/coming-soon";
import { RecoverySection, RecoverySectionSkeleton } from "@/components/wearables/recovery-section";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ oura_error?: string }>;
}) {
  const { oura_error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const reports = await getBloodReports();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-24">
      <TopNav name={profile.name} showSuggestedTestsLink showMealPlanLink />
      <Greeting name={profile.name} />

      <Suspense fallback={<VitalityHeroSkeleton />}>
        <VitalitySection />
      </Suspense>

      <ComingSoon />

      <Suspense fallback={<RecoverySectionSkeleton />}>
        <RecoverySection ouraError={oura_error === "1"} />
      </Suspense>

      <section
        id="blood-reports"
        className="mt-16 flex flex-col gap-6 border-t border-line pt-16"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-ink italic sm:text-3xl">
            Your Blood Reports
          </h2>
          <form action={signOut}>
            <button
              type="submit"
              className="border border-ink/20 px-4 py-2 font-sans text-sm text-ink transition-colors hover:border-ink"
            >
              Sign Out
            </button>
          </form>
        </div>
        <UploadReportForm />
        <ReportsList reports={reports} />
      </section>
    </main>
  );
}
