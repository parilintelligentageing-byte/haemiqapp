// Shared between the server action (which writes this marker) and the
// client component (which reads it) — kept out of lib/actions/blood-reports.ts
// because a "use server" file may only export async server actions.

// Sentinel stored in blood_reports.notes when a failure means "Claude
// found no biomarkers at all" (probably not a blood report), as opposed
// to a genuine technical error. The UI checks for this exact marker to
// choose a friendly message — it never renders `notes` directly.
export const NO_BIOMARKERS_MARKER = "NO_BIOMARKERS";

export function isNoBiomarkersFailure(notes: string | null): boolean {
  return notes === NO_BIOMARKERS_MARKER;
}
