import Link from "next/link";
import { disconnectOura, getRecoveryData } from "@/lib/actions/wearables";
import { RecoveryStatCard } from "@/components/wearables/recovery-stat-card";
import { DevSeedButton } from "@/components/wearables/dev-seed-button";

function vitalsFootnote(
  restingHeartRate: number | null,
  hrvAvg: number | null
): string | undefined {
  const parts = [
    restingHeartRate !== null ? `${restingHeartRate} bpm resting` : null,
    hrvAvg !== null ? `${hrvAvg} ms HRV` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function RecoverySectionSkeleton() {
  return (
    <div className="mt-16">
      <div className="h-3 w-20 animate-pulse rounded-full bg-surface" />
      <div className="mt-6 h-24 animate-pulse rounded-[20px] bg-surface" />
    </div>
  );
}

export async function RecoverySection({ ouraError = false }: { ouraError?: boolean }) {
  const { state, today, syncIssue } = await getRecoveryData();

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-xs font-bold tracking-[0.32em] text-gold uppercase">
          Recovery
        </h2>
        {state === "connected" && (
          <form action={disconnectOura}>
            <button
              type="submit"
              className="font-sans text-xs text-text-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
            >
              Disconnect
            </button>
          </form>
        )}
      </div>

      {ouraError && (
        <p className="mt-3 font-sans text-xs text-alert">
          Couldn&apos;t connect to Oura — please try again.
        </p>
      )}

      {state !== "connected" && (
        <div className="mt-6 flex flex-col items-start gap-4 rounded-[20px] border border-line bg-surface p-6">
          <div>
            <h3 className="font-serif text-lg text-ink italic">Connect your Oura Ring</h3>
            <p className="mt-2 font-sans text-xs text-text-soft">
              {state === "expired"
                ? "Your Oura connection expired — reconnect to keep seeing your recovery data."
                : "See your sleep, readiness, and activity scores alongside your blood work."}
            </p>
          </div>
          <Link
            href="/oura/connect"
            className="rounded-full bg-teal px-5 py-2.5 font-sans text-sm font-semibold tracking-wide text-paper uppercase transition-opacity hover:opacity-90"
          >
            Connect Oura Ring
          </Link>
        </div>
      )}

      {state === "connected" && !today && (
        <div className="mt-6 rounded-[20px] border border-line bg-surface p-6">
          <p className="font-sans text-sm text-text-soft">
            Connected — we&apos;ll show your recovery data as soon as Oura has synced your first
            night.
          </p>
        </div>
      )}

      {state === "connected" && today && (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <RecoveryStatCard
            label="Sleep"
            score={today.sleep_score}
            footnote={vitalsFootnote(today.resting_heart_rate, today.hrv_avg)}
          />
          <RecoveryStatCard label="Readiness" score={today.readiness_score} />
          <RecoveryStatCard label="Activity" score={today.activity_score} />
        </div>
      )}

      {state === "connected" && syncIssue && (
        <p className="mt-3 font-sans text-xs text-text-soft">
          We had trouble refreshing your latest Oura data — showing the most recent sync.
        </p>
      )}

      {process.env.NODE_ENV === "development" && <DevSeedButton />}
    </div>
  );
}
