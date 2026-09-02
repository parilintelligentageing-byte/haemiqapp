import type { Gender } from "@/lib/types/user-profile";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalIntensity = "mild" | "moderate" | "aggressive";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const INTENSITY_ADJUSTMENT: Record<GoalIntensity, number> = {
  mild: 0.1,
  moderate: 0.2,
  aggressive: 0.25,
};

const INTENSITY_LABELS: Record<GoalIntensity, string> = {
  mild: "Mild",
  moderate: "Moderate",
  aggressive: "Aggressive",
};

const WEIGHT_LOSS_GOALS = new Set(["Weight loss"]);
const MUSCLE_GAIN_GOALS = new Set(["Muscle gain"]);
const BODY_RECOMP_GOALS = new Set(["Body Recomposition"]);

// Muscle Gain uses one fixed surplus rather than the mild/moderate/
// aggressive dial Fat Loss has — see lib/meal-plan/preference-options.ts,
// where it's removed from INTENSITY_RELEVANT_GOALS to match.
const MUSCLE_GAIN_SURPLUS = 0.1;

// Mifflin-St Jeor's offset term. Non-binary/prefer-not-to-say profiles use
// the average of the male (+5) and female (-161) offsets — there's no
// clinical third formula, and this is the least-wrong single number
// available without one.
function bmrOffset(gender: Gender | null): number {
  if (gender === "male") return 5;
  if (gender === "female") return -161;
  return -78;
}

export function calculateBMR(input: {
  age: number;
  gender: Gender | null;
  heightCm: number;
  weightKg: number;
}): number {
  const { age, gender, heightCm, weightKg } = input;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + bmrOffset(gender);
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel | null): number {
  const multiplier = activityLevel ? ACTIVITY_MULTIPLIERS[activityLevel] : ACTIVITY_MULTIPLIERS.moderate;
  return bmr * multiplier;
}

// The safer (higher) of the two stated floors is used for non-binary/
// prefer-not-to-say profiles, since there's no clinical basis to pick
// the lower one instead.
function safetyFloor(gender: Gender | null): number {
  return gender === "female" ? 1200 : 1500;
}

export interface CalorieTargetInput {
  age: number;
  gender: Gender | null;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel | null;
  primaryGoal: string | null;
  goalIntensity: GoalIntensity | null;
}

export interface CalorieTargetResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  floorApplied: boolean;
  goalLabel: string | null;
  proteinTargetG: number;
  fatTargetG: number;
  carbTargetG: number;
  gender: Gender | null;
}

// Protein is derived from bodyweight FIRST, not as a share of calories —
// otherwise it silently gets squeezed out by whatever's left over. Factors
// per goal, evidence-based ranges: Fat Loss 2.0 g/kg (top of the 1.6-2.2
// g/kg range, to preserve lean mass in a deficit), Muscle Gain 1.8 g/kg,
// Body Recomposition 2.2 g/kg (highest of the three — simultaneously
// building and losing needs the most protection), 1.2 g/kg for
// maintenance/longevity goals with no deficit or surplus to protect
// against.
const FAT_LOSS_PROTEIN_FACTOR = 2.0;
const MUSCLE_GAIN_PROTEIN_FACTOR = 1.8;
const BODY_RECOMP_PROTEIN_FACTOR = 2.2;
const MAINTENANCE_PROTEIN_FACTOR = 1.2;

// Fat Loss/Muscle Gain/Body Recomposition all use a bodyweight-based fat
// floor (0.8 g/kg) rather than a share of calories, so it never gets
// squeezed to nothing by an aggressive deficit or surplus. Goals outside
// those three (no g/kg spec given) keep the original fixed share of total
// calories.
const GKG_FAT_FLOOR = 0.8;
const FAT_SHARE_OF_TOTAL = 0.25;

function calculateMacroTargets(
  weightKg: number,
  primaryGoal: string | null,
  targetCalories: number
): { proteinTargetG: number; fatTargetG: number; carbTargetG: number } {
  let proteinFactor = MAINTENANCE_PROTEIN_FACTOR;
  let useGkgFat = false;

  if (primaryGoal && WEIGHT_LOSS_GOALS.has(primaryGoal)) {
    proteinFactor = FAT_LOSS_PROTEIN_FACTOR;
    useGkgFat = true;
  } else if (primaryGoal && MUSCLE_GAIN_GOALS.has(primaryGoal)) {
    proteinFactor = MUSCLE_GAIN_PROTEIN_FACTOR;
    useGkgFat = true;
  } else if (primaryGoal && BODY_RECOMP_GOALS.has(primaryGoal)) {
    proteinFactor = BODY_RECOMP_PROTEIN_FACTOR;
    useGkgFat = true;
  }

  const proteinTargetG = Math.round(weightKg * proteinFactor);
  const proteinKcal = proteinTargetG * 4;

  const fatKcal = useGkgFat ? weightKg * GKG_FAT_FLOOR * 9 : targetCalories * FAT_SHARE_OF_TOTAL;
  const fatTargetG = Math.round(fatKcal / 9);

  const carbKcal = Math.max(0, targetCalories - proteinKcal - fatKcal);
  const carbTargetG = Math.round(carbKcal / 4);

  return { proteinTargetG, fatTargetG, carbTargetG };
}

export function calculateTargetCalories(input: CalorieTargetInput): CalorieTargetResult {
  const bmr = calculateBMR(input);
  const tdee = calculateTDEE(bmr, input.activityLevel);

  let rawTarget = tdee;
  let goalLabel: string | null = null;

  if (input.primaryGoal && WEIGHT_LOSS_GOALS.has(input.primaryGoal)) {
    if (input.goalIntensity) {
      rawTarget = tdee * (1 - INTENSITY_ADJUSTMENT[input.goalIntensity]);
      goalLabel = `${INTENSITY_LABELS[input.goalIntensity]} fat loss`;
    } else {
      goalLabel = "Fat loss";
    }
  } else if (input.primaryGoal && MUSCLE_GAIN_GOALS.has(input.primaryGoal)) {
    rawTarget = tdee * (1 + MUSCLE_GAIN_SURPLUS);
    goalLabel = "Muscle gain";
  } else if (input.primaryGoal && BODY_RECOMP_GOALS.has(input.primaryGoal)) {
    rawTarget = tdee;
    goalLabel = "Body recomposition";
  } else if (input.primaryGoal) {
    goalLabel = "Maintenance";
  }

  // Hard safety floor: never below BMR, and never below the gender-based
  // minimum, regardless of how aggressive the selected intensity is.
  const floor = Math.max(bmr, safetyFloor(input.gender));
  const floorApplied = rawTarget < floor;
  const targetCalories = Math.round(floorApplied ? floor : rawTarget);

  const { proteinTargetG, fatTargetG, carbTargetG } = calculateMacroTargets(
    input.weightKg,
    input.primaryGoal,
    targetCalories
  );

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories,
    floorApplied,
    goalLabel,
    proteinTargetG,
    fatTargetG,
    carbTargetG,
    gender: input.gender,
  };
}
