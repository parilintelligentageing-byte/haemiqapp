import type { VitalityCategoryKey } from "@/lib/vitality/biomarker-metadata";

export interface ImprovementTip {
  title: string;
  description: string;
}

// Static placeholder content per the build spec — draft copy to be
// refined later, not generated per-user.
export const IMPROVEMENT_TIPS: Record<VitalityCategoryKey, ImprovementTip[]> = {
  metabolic: [
    {
      title: "Walk after meals",
      description: "A 10-15 minute walk after eating measurably blunts post-meal blood sugar spikes.",
    },
    {
      title: "Prioritize fiber and protein first",
      description: "Eating vegetables and protein before carbohydrates slows glucose absorption.",
    },
    {
      title: "Limit refined carbohydrates",
      description: "Swapping refined grains and added sugars for whole foods improves insulin sensitivity over weeks.",
    },
    {
      title: "Strength train 2-3x per week",
      description: "More muscle mass means more places to store glucose, easing the load on your metabolism.",
    },
  ],
  cardiovascular: [
    {
      title: "Favor unsaturated fats",
      description: "Olive oil, nuts, and fatty fish support a healthier lipid profile than saturated fats.",
    },
    {
      title: "Add soluble fiber",
      description: "Oats, legumes, and psyllium can meaningfully lower LDL cholesterol over 4-6 weeks.",
    },
    {
      title: "Move most days",
      description: "Regular aerobic activity raises HDL and helps clear triglycerides from the blood.",
    },
    {
      title: "Reduce alcohol intake",
      description: "Cutting back on alcohol can lower triglycerides and improve overall lipid balance.",
    },
  ],
  hormonal: [
    {
      title: "Prioritize sleep consistency",
      description: "Hormone production follows your sleep-wake cycle — irregular sleep disrupts it.",
    },
    {
      title: "Manage stress deliberately",
      description: "Chronically high cortisol can suppress thyroid and sex hormone production.",
    },
    {
      title: "Resistance train regularly",
      description: "Strength training supports healthy testosterone and metabolic hormone levels.",
    },
    {
      title: "Get adequate healthy fats",
      description: "Hormones are synthesized from cholesterol and fat — very low-fat diets can impair production.",
    },
  ],
  nutritional: [
    {
      title: "Get sensible sun exposure",
      description: "10-20 minutes of midday sun several times a week supports vitamin D synthesis.",
    },
    {
      title: "Eat a variety of whole foods",
      description: "Rotating vegetables, meats, and whole grains covers a broader range of micronutrients.",
    },
    {
      title: "Consider targeted supplementation",
      description: "For a confirmed deficiency, a targeted supplement often closes the gap faster than diet alone.",
    },
    {
      title: "Check absorption, not just intake",
      description: "Gut health issues can cause deficiencies even with adequate dietary intake.",
    },
  ],
  inflammation: [
    {
      title: "Prioritize anti-inflammatory foods",
      description: "Oily fish, olive oil, berries, and leafy greens are consistently linked to lower CRP.",
    },
    {
      title: "Improve sleep quality",
      description: "Poor sleep is one of the strongest everyday drivers of systemic inflammation.",
    },
    {
      title: "Move your body daily",
      description: "Regular moderate exercise lowers baseline inflammation over time, even without weight loss.",
    },
    {
      title: "Address underlying triggers",
      description: "Persistent elevation is worth discussing with a doctor to rule out an underlying cause.",
    },
  ],
  liverKidney: [
    {
      title: "Moderate alcohol intake",
      description: "Alcohol is one of the most direct levers on liver enzyme levels like ALT and GGT.",
    },
    {
      title: "Stay well hydrated",
      description: "Adequate water intake supports healthy kidney filtration.",
    },
    {
      title: "Be mindful of medication load",
      description: "Some common medications and supplements are processed by the liver — review these with a doctor.",
    },
    {
      title: "Maintain a healthy weight",
      description: "Excess weight, especially visceral fat, is strongly linked to fatty liver and elevated liver enzymes.",
    },
  ],
};
