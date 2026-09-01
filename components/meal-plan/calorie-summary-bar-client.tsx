"use client";

import { useState } from "react";
import type { CalorieTargetResult } from "@/lib/nutrition/calorie-targets";
import type { MicronutrientTotals } from "@/lib/nutrition/micronutrients";

type MacroTotals = { calories: number; protein: number; carbs: number; fat: number };

const MICRONUTRIENT_ROWS: Array<{ key: keyof MicronutrientTotals; label: string; unit: string }> = [
  { key: "ironMg", label: "Iron", unit: "mg" },
  { key: "vitaminB12Mcg", label: "Vitamin B12", unit: "mcg" },
  { key: "folateMcg", label: "Folate", unit: "mcg" },
  { key: "vitaminDMcg", label: "Vitamin D", unit: "mcg" },
  { key: "calciumMg", label: "Calcium", unit: "mg" },
  { key: "potassiumMg", label: "Potassium", unit: "mg" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "fiberG", label: "Fiber", unit: "g" },
];

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 font-sans text-xs transition-colors ${
        active ? "border-teal bg-teal/10 text-ink" : "border-line text-text-soft hover:border-text-soft"
      }`}
    >
      {label}
    </button>
  );
}

export function CalorieSummaryBarClient({
  target,
  totals,
  micronutrients,
}: {
  target: CalorieTargetResult | null;
  totals: MacroTotals;
  micronutrients: MicronutrientTotals;
}) {
  const [expanded, setExpanded] = useState<"macros" | "micros" | null>(null);

  const actual = Math.round(totals.calories);
  const targetLabel = target
    ? `Target: ${target.targetCalories.toLocaleString()} kcal${target.goalLabel ? ` · ${target.goalLabel}` : ""}`
    : "Complete your profile to see a calorie target";

  const delta = target ? actual - target.targetCalories : null;
  const deltaLabel =
    delta === null
      ? null
      : Math.abs(delta) <= 10
        ? "On target"
        : delta > 0
          ? `${delta} kcal over`
          : `${Math.abs(delta)} kcal under`;

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-line bg-surface px-6 py-8 sm:px-10 sm:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/3 -right-1/4 h-[70%] w-[70%] rounded-full bg-teal/[0.06] blur-3xl"
      />

      <div className="relative flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
          <div>
            <p className="font-sans text-[10px] font-semibold tracking-[0.14em] text-gold uppercase">
              Today&apos;s plan
            </p>
            <p className="mt-2 font-serif text-2xl text-ink italic sm:text-3xl">{targetLabel}</p>
          </div>
          <div className="flex flex-col items-center sm:items-end">
            <p className="font-serif text-2xl text-ink italic">{actual.toLocaleString()} kcal</p>
            {deltaLabel && (
              <p
                className="font-sans text-xs"
                style={{ color: deltaLabel === "On target" ? "var(--color-sage)" : "var(--color-text-soft)" }}
              >
                {deltaLabel}
              </p>
            )}
          </div>
        </div>

        {target?.floorApplied && (
          <p className="text-center font-sans text-xs text-text-soft sm:text-left">
            Adjusted up to your minimum safe calorie floor.
          </p>
        )}

        <div className="flex justify-center gap-2 sm:justify-start">
          <ToggleButton
            label="Macros"
            active={expanded === "macros"}
            onClick={() => setExpanded((prev) => (prev === "macros" ? null : "macros"))}
          />
          <ToggleButton
            label="Micronutrients"
            active={expanded === "micros"}
            onClick={() => setExpanded((prev) => (prev === "micros" ? null : "micros"))}
          />
        </div>

        {expanded === "macros" && (
          <div className="grid grid-cols-3 gap-4 border-t border-line pt-6">
            {[
              { label: "Protein", value: totals.protein, target: target?.proteinTargetG, unit: "g" },
              { label: "Carbs", value: totals.carbs, target: target?.carbTargetG, unit: "g" },
              { label: "Fat", value: totals.fat, target: target?.fatTargetG, unit: "g" },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <p className="font-serif text-xl text-ink italic">
                  {Math.round(m.value)}
                  {m.target !== undefined && (
                    <span className="text-base text-text-soft">
                      {" "}
                      / {m.target}
                      {m.unit}
                    </span>
                  )}
                  {m.target === undefined && m.unit}
                </p>
                <p className="mt-1 font-sans text-[10px] tracking-wide text-text-soft uppercase">{m.label}</p>
              </div>
            ))}
          </div>
        )}

        {expanded === "micros" && (
          <div className="grid grid-cols-2 gap-4 border-t border-line pt-6 sm:grid-cols-4">
            {MICRONUTRIENT_ROWS.map((row) => (
              <div key={row.key} className="text-center">
                <p className="font-serif text-lg text-ink italic">
                  {Math.round(micronutrients[row.key])}
                  {row.unit}
                </p>
                <p className="mt-1 font-sans text-[10px] tracking-wide text-text-soft uppercase">{row.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
