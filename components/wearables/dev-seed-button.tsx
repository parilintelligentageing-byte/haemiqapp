import { seedDevFakeData } from "@/lib/actions/wearables";

// Only ever rendered by RecoverySection when NODE_ENV === "development"
// — and seedDevFakeData itself re-checks that server-side, so this stays
// inert even if someone finds it via devtools in a deployed build.
export function DevSeedButton() {
  return (
    <form action={seedDevFakeData} className="mt-4">
      <button
        type="submit"
        className="rounded-full border border-dashed border-alert/60 px-4 py-2 font-sans text-xs font-semibold tracking-wide text-alert uppercase transition-opacity hover:opacity-80"
      >
        Dev only: seed fake Oura data
      </button>
    </form>
  );
}
