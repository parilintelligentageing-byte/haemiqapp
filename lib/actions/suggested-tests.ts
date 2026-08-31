import { getBloodReports } from "@/lib/actions/blood-reports";
import { CATEGORY_KEYS, type VitalityCategoryKey } from "@/lib/vitality/calculate-score";
import { RECOMMENDED_TESTS, getMissingTests, type RecommendedTest } from "@/lib/vitality/recommended-tests";

export interface SuggestedTestsData {
  hasReport: boolean;
  totalTests: number;
  coveredCount: number;
  missingByCategory: Record<VitalityCategoryKey, RecommendedTest[]>;
}

export async function getSuggestedTestsData(): Promise<SuggestedTestsData> {
  const reports = await getBloodReports();
  const latestCompleted = reports.find((r) => r.status === "completed");
  const biomarkers = latestCompleted?.biomarkers ?? [];

  const missing = getMissingTests(biomarkers);
  const missingByCategory = {} as Record<VitalityCategoryKey, RecommendedTest[]>;
  for (const key of CATEGORY_KEYS) {
    missingByCategory[key] = missing.filter((test) => test.category === key);
  }

  return {
    hasReport: Boolean(latestCompleted),
    totalTests: RECOMMENDED_TESTS.length,
    coveredCount: RECOMMENDED_TESTS.length - missing.length,
    missingByCategory,
  };
}
