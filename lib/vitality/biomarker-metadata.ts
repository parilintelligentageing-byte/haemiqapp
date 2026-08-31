export type VitalityCategoryKey =
  | "metabolic"
  | "cardiovascular"
  | "hormonal"
  | "nutritional"
  | "inflammation"
  | "liverKidney";

// "two_bound" (default) has both a low and high reference bound and an
// optimal middle. "ceiling_only" is a lower-is-better test where only the
// upper limit matters (LDL, CRP, ...). "floor_only" is a higher-is-better
// test where only the lower limit matters (HDL, Vitamin D, ...). Drives
// the range bar's segment coloring and dot placement in range-bar.tsx.
export type RangeType = "two_bound" | "ceiling_only" | "floor_only";

export interface BiomarkerMeta {
  /** Most biomarkers belong to one category; a few (e.g. ferritin) count
   *  toward more than one. */
  categories: VitalityCategoryKey[];
  description: string;
  optimalContext: string;
  rangeType: RangeType;
}

interface BiomarkerDefinition extends Omit<BiomarkerMeta, "rangeType"> {
  aliases: string[];
  rangeType?: RangeType;
}

// Draft copy — placeholder content per the build spec, to be refined
// later. Matched by normalized name, so "LDL Cholesterol", "LDL-C", and
// "ldl" all resolve to the same entry regardless of how the extraction
// happened to phrase it.
const DEFINITIONS: BiomarkerDefinition[] = [
  // Metabolic
  {
    aliases: ["hba1c", "hemoglobin a1c", "haemoglobin a1c", "a1c", "glycated hemoglobin"],
    categories: ["metabolic"],
    description: "Reflects your average blood sugar over the past 2-3 months.",
    optimalContext: "Below 5.7% is optimal for most adults; 5.7-6.4% is pre-diabetic range.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["glucose", "fasting glucose", "blood glucose", "fasting blood glucose"],
    categories: ["metabolic"],
    description: "A snapshot of blood sugar at the moment of the test.",
    optimalContext: "70-99 mg/dL (3.9-5.5 mmol/L) fasting is considered optimal.",
  },
  {
    aliases: ["insulin", "fasting insulin"],
    categories: ["metabolic"],
    description: "The hormone that moves glucose out of the bloodstream into cells.",
    optimalContext: "Lower fasting insulin generally reflects better insulin sensitivity.",
  },
  {
    aliases: ["triglycerides", "trig"],
    categories: ["metabolic"],
    description: "A type of fat in the blood, strongly influenced by diet and metabolic health.",
    optimalContext: "Below 150 mg/dL (1.7 mmol/L) is optimal.",
    rangeType: "ceiling_only",
  },

  // Cardiovascular
  {
    aliases: ["hdl", "hdl cholesterol", "hdl-c"],
    categories: ["cardiovascular"],
    description: "\"Good\" cholesterol that helps clear excess cholesterol from the bloodstream.",
    optimalContext: "Higher is generally better; above 60 mg/dL is protective.",
    rangeType: "floor_only",
  },
  {
    aliases: ["ldl", "ldl cholesterol", "ldl-c"],
    categories: ["cardiovascular"],
    description: "\"Bad\" cholesterol that can build up in artery walls over time.",
    optimalContext: "Below 100 mg/dL is optimal for most adults.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["cholesterol total", "total cholesterol", "cholesterol"],
    categories: ["cardiovascular"],
    description: "The total amount of cholesterol carried in your blood.",
    optimalContext: "Below 200 mg/dL is desirable.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["non-hdl cholesterol", "non hdl cholesterol", "non-hdl-c"],
    categories: ["cardiovascular"],
    description: "All the cholesterol that isn't HDL — a strong predictor of cardiovascular risk.",
    optimalContext: "Below 130 mg/dL is optimal.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["vldl", "vldl cholesterol"],
    categories: ["cardiovascular"],
    description: "A triglyceride-rich particle that also contributes to plaque buildup.",
    optimalContext: "Below 30 mg/dL is typical of a healthy metabolic state.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["apob", "apolipoprotein b"],
    categories: ["cardiovascular"],
    description: "A marker of the total number of artery-clogging particles in the blood.",
    optimalContext: "Below 90 mg/dL is considered optimal.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["lp(a)", "lpa", "lipoprotein a", "lipoprotein(a)"],
    categories: ["cardiovascular"],
    description: "A largely genetic cardiovascular risk factor, independent of lifestyle-driven cholesterol markers.",
    optimalContext: "Below 75 nmol/L (or ~30 mg/dL) is considered lower risk.",
    rangeType: "ceiling_only",
  },

  // Hormonal
  {
    aliases: ["testosterone", "total testosterone"],
    categories: ["hormonal"],
    description: "A key hormone for energy, muscle mass, and libido in both men and women.",
    optimalContext: "Optimal range varies significantly by age and sex.",
    rangeType: "floor_only",
  },
  {
    aliases: ["shbg", "sex hormone binding globulin"],
    categories: ["hormonal"],
    description: "A protein that binds sex hormones, affecting how much is freely available to tissues.",
    optimalContext: "Extremes in either direction can point to a hormonal imbalance worth exploring.",
  },
  {
    aliases: ["tsh", "thyroid stimulating hormone"],
    categories: ["hormonal"],
    description: "Signals the thyroid to produce more or less hormone — the primary thyroid screening test.",
    optimalContext: "0.4-4.0 mIU/L is the typical reference range; many clinicians prefer under 2.5.",
  },
  {
    aliases: ["free t3", "ft3", "triiodothyronine"],
    categories: ["hormonal"],
    description: "The active thyroid hormone that drives metabolism at the cellular level.",
    optimalContext: "Best interpreted alongside TSH and Free T4.",
  },
  {
    aliases: ["free t4", "ft4", "thyroxine"],
    categories: ["hormonal"],
    description: "The main hormone produced by the thyroid, converted to active T3 in tissues.",
    optimalContext: "Best interpreted alongside TSH and Free T3.",
  },
  {
    aliases: ["estradiol", "e2"],
    categories: ["hormonal"],
    description: "The primary form of estrogen, important for reproductive and bone health.",
    optimalContext: "Optimal range varies significantly by sex, age, and cycle phase.",
  },

  // Nutritional
  {
    aliases: ["vitamin d", "25-hydroxyvitamin d", "vitamin d3", "25-oh vitamin d"],
    categories: ["nutritional"],
    description: "Fat-soluble vitamin critical for bone, immune, and hormonal health.",
    optimalContext: "For Australian adults, aim for 75-150 nmol/L year-round.",
    rangeType: "floor_only",
  },
  {
    aliases: ["vitamin b12", "b12", "cobalamin"],
    categories: ["nutritional"],
    description: "Essential for nerve function and red blood cell production.",
    optimalContext: "Above 300 pmol/L is generally considered sufficient.",
    rangeType: "floor_only",
  },
  {
    aliases: ["ferritin"],
    // Ferritin is both a stored-iron marker and an acute-phase inflammation
    // marker — it genuinely counts toward both categories.
    categories: ["nutritional", "inflammation"],
    description: "Reflects the body's stored iron levels, but also rises during inflammation.",
    optimalContext: "30-150 ng/mL is a reasonable target range for most adults.",
    rangeType: "floor_only",
  },
  {
    aliases: ["iron", "serum iron"],
    categories: ["nutritional"],
    description: "The amount of iron currently circulating in the blood.",
    optimalContext: "Best interpreted alongside ferritin and transferrin saturation.",
    rangeType: "floor_only",
  },
  {
    aliases: ["folate", "folic acid", "vitamin b9"],
    categories: ["nutritional"],
    description: "A B vitamin essential for cell division and DNA synthesis.",
    optimalContext: "Above the lab's lower reference bound is generally sufficient.",
    rangeType: "floor_only",
  },
  {
    aliases: ["magnesium"],
    categories: ["nutritional"],
    description: "Involved in hundreds of enzymatic reactions, including energy production and muscle function.",
    optimalContext: "Mid-to-upper end of the reference range tends to feel best for most people.",
    rangeType: "floor_only",
  },

  // Inflammation
  {
    aliases: ["crp", "c-reactive protein", "hs-crp", "high sensitivity crp", "hscrp"],
    categories: ["inflammation"],
    description: "A general marker of inflammation anywhere in the body.",
    optimalContext: "Below 1.0 mg/L is considered low cardiovascular risk.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["esr", "erythrocyte sedimentation rate", "sed rate"],
    categories: ["inflammation"],
    description: "An older, less specific marker of inflammation, often used alongside CRP.",
    optimalContext: "Lower is generally better; reference ranges vary by age and sex.",
  },
  {
    aliases: ["homocysteine"],
    categories: ["inflammation"],
    description: "An amino acid linked to cardiovascular and inflammatory risk when elevated.",
    optimalContext: "Below 10 micromol/L is generally considered favorable.",
    rangeType: "ceiling_only",
  },

  // Liver & Kidney
  {
    aliases: ["alt", "alanine aminotransferase", "sgpt"],
    categories: ["liverKidney"],
    description: "A liver enzyme that rises when liver cells are stressed or damaged.",
    optimalContext: "Lower end of the reference range reflects a happier liver.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["ast", "aspartate aminotransferase", "sgot"],
    categories: ["liverKidney"],
    description: "Another liver enzyme, also present in muscle and heart tissue.",
    optimalContext: "Best interpreted alongside ALT.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["ggt", "gamma-glutamyl transferase", "gamma gt"],
    categories: ["liverKidney"],
    description: "A liver enzyme sensitive to alcohol intake and bile duct issues.",
    optimalContext: "Lower end of the reference range is preferable.",
    rangeType: "ceiling_only",
  },
  {
    aliases: ["creatinine", "serum creatinine"],
    categories: ["liverKidney"],
    description: "A muscle-derived waste product filtered by the kidneys — a core kidney function marker.",
    optimalContext: "Interpreted relative to eGFR, age, and muscle mass.",
  },
  {
    aliases: ["egfr", "estimated gfr", "estimated glomerular filtration rate"],
    categories: ["liverKidney"],
    description: "An estimate of how well the kidneys are filtering blood.",
    optimalContext: "Above 90 mL/min/1.73m² is considered normal kidney function.",
  },
  {
    aliases: ["urea", "blood urea nitrogen", "bun"],
    categories: ["liverKidney"],
    description: "A waste product of protein metabolism, filtered by the kidneys.",
    optimalContext: "Interpreted alongside creatinine and eGFR.",
  },
  {
    aliases: ["albumin", "serum albumin"],
    categories: ["liverKidney"],
    description: "A protein made by the liver that reflects nutritional status and liver function.",
    optimalContext: "Upper half of the reference range is generally favorable.",
    rangeType: "floor_only",
  },
];

export function normalizeBiomarkerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const LOOKUP: Map<string, BiomarkerMeta> = new Map();
for (const def of DEFINITIONS) {
  const meta: BiomarkerMeta = {
    categories: def.categories,
    description: def.description,
    optimalContext: def.optimalContext,
    rangeType: def.rangeType ?? "two_bound",
  };
  for (const alias of def.aliases) {
    LOOKUP.set(normalizeBiomarkerName(alias), meta);
  }
}

export function getBiomarkerMeta(name: string): BiomarkerMeta | null {
  return LOOKUP.get(normalizeBiomarkerName(name)) ?? null;
}

/** Defaults to two-bound rendering when metadata is missing or doesn't
 *  specify a type — matches getBiomarkerMeta's own default. */
export function getRangeType(name: string): RangeType {
  return getBiomarkerMeta(name)?.rangeType ?? "two_bound";
}
