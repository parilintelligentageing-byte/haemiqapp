import { createClient } from "@/lib/supabase/server";
import { getBloodReports } from "@/lib/actions/blood-reports";
import {
  calculateVitalityScore,
  groupBiomarkersByCategory,
  type ScoredBiomarker,
  type VitalityCategoryKey,
  type VitalityScore,
} from "@/lib/vitality/calculate-score";
import type { Gender } from "@/lib/types/user-profile";

export type ReportState = "empty" | "processing" | "ready";

export interface VitalityData {
  gender: Gender | null;
  reportState: ReportState;
  score: VitalityScore | null;
  biomarkersByCategory: Record<VitalityCategoryKey, ScoredBiomarker[]>;
}

export async function getVitalityData(): Promise<VitalityData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: VitalityData = {
    gender: null,
    reportState: "empty",
    score: null,
    biomarkersByCategory: {
      metabolic: [],
      cardiovascular: [],
      hormonal: [],
      nutritional: [],
      inflammation: [],
      liverKidney: [],
    },
  };

  if (!user) return empty;

  const [{ data: profile }, reports] = await Promise.all([
    supabase.from("user_profiles").select("gender").eq("id", user.id).maybeSingle(),
    getBloodReports(),
  ]);

  const gender = (profile?.gender as Gender | null) ?? null;
  const latestCompleted = reports.find((r) => r.status === "completed");

  if (latestCompleted) {
    return {
      gender,
      reportState: "ready",
      score: calculateVitalityScore(latestCompleted.biomarkers),
      biomarkersByCategory: groupBiomarkersByCategory(latestCompleted.biomarkers),
    };
  }

  const latestProcessing = reports.find((r) => r.status === "processing");
  if (latestProcessing) {
    return { ...empty, gender, reportState: "processing" };
  }

  return { ...empty, gender };
}
