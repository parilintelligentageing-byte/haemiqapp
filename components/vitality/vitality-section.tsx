import { getVitalityData } from "@/lib/actions/vitality";
import { VitalityHero } from "@/components/vitality/vitality-hero";
import { CategorySection } from "@/components/vitality/category-section";

// One data fetch serves both the hero and the category tiles/drawer below
// it, since they're never meaningfully separable — this is the whole
// reason they share a single Suspense boundary in the dashboard page.
export async function VitalitySection() {
  const { gender, reportState, score, biomarkersByCategory } = await getVitalityData();

  return (
    <>
      <VitalityHero gender={gender} reportState={reportState} score={score} />
      {reportState !== "processing" && (
        <CategorySection score={score} biomarkersByCategory={biomarkersByCategory} />
      )}
    </>
  );
}
