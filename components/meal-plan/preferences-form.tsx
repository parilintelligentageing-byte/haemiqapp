"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveMealPreferences, type SaveMealPreferencesState } from "@/lib/actions/meal-preferences";
import { DIETARY_OPTIONS, GOAL_OPTIONS } from "@/lib/meal-plan/preference-options";

const initialState: SaveMealPreferencesState = { error: null };

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-teal px-8 py-3 font-sans text-sm font-semibold tracking-wide text-paper uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function AllergyTagInput({ allergies, setAllergies }: { allergies: string[]; setAllergies: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const value = draft.trim().replace(/,$/, "");
    if (value && !allergies.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setAllergies([...allergies, value]);
    }
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {allergies.map((allergy) => (
          <span
            key={allergy}
            className="flex items-center gap-1.5 rounded-full border border-alert/50 bg-alert/10 px-3 py-1 font-sans text-xs text-alert"
          >
            {allergy}
            <button
              type="button"
              aria-label={`Remove ${allergy}`}
              onClick={() => setAllergies(allergies.filter((a) => a !== allergy))}
              className="text-alert transition-opacity hover:opacity-70"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          }
        }}
        onBlur={commitDraft}
        placeholder="e.g. peanuts — press Enter to add"
        className="w-full border-b border-line bg-transparent pb-2 font-sans text-sm text-ink placeholder:text-text-soft focus:border-teal focus:outline-none"
      />
      {allergies.map((allergy) => (
        <input key={allergy} type="hidden" name="allergies" value={allergy} />
      ))}
    </div>
  );
}

export function PreferencesForm({
  initialDietaryPreferences,
  initialAllergies,
  initialPrimaryGoal,
  title,
  description,
  submitLabel,
}: {
  initialDietaryPreferences: string[];
  initialAllergies: string[];
  initialPrimaryGoal: string | null;
  title: string;
  description: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(saveMealPreferences, initialState);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>(initialDietaryPreferences);
  const [allergies, setAllergies] = useState<string[]>(initialAllergies);
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(initialPrimaryGoal);

  const toggleDiet = (option: string) => {
    setDietaryPreferences((prev) =>
      prev.includes(option) ? prev.filter((d) => d !== option) : [...prev, option]
    );
  };

  return (
    <form action={formAction} className="rounded-[20px] border border-line bg-surface p-6">
      <p className="font-sans text-[10px] font-semibold tracking-[0.14em] text-gold uppercase">{title}</p>
      <p className="mt-1 font-sans text-sm text-text-soft">{description}</p>

      <div className="mt-5">
        <span className="font-sans text-xs uppercase tracking-wide text-text-soft">Dietary preference</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={dietaryPreferences.includes(option)}
              onClick={() => toggleDiet(option)}
              className={`rounded-full border px-4 py-2 font-sans text-xs transition-colors ${
                dietaryPreferences.includes(option)
                  ? "border-teal bg-teal/10 text-ink"
                  : "border-line text-text-soft hover:border-text-soft"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {dietaryPreferences.map((option) => (
          <input key={option} type="hidden" name="dietary_preferences" value={option} />
        ))}
      </div>

      <div className="mt-5">
        <span className="font-sans text-xs uppercase tracking-wide text-text-soft">Allergies (optional)</span>
        <div className="mt-2">
          <AllergyTagInput allergies={allergies} setAllergies={setAllergies} />
        </div>
      </div>

      <div className="mt-5">
        <span className="font-sans text-xs uppercase tracking-wide text-text-soft">Primary goal</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={primaryGoal === option}
              onClick={() => setPrimaryGoal(option)}
              className={`rounded-full border px-4 py-2 font-sans text-xs transition-colors ${
                primaryGoal === option
                  ? "border-teal bg-teal/10 text-ink"
                  : "border-line text-text-soft hover:border-text-soft"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <input type="hidden" name="primary_goal" value={primaryGoal ?? ""} />
      </div>

      {state.error && (
        <p className="mt-4 font-sans text-sm text-alert" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-6">
        <SaveButton label={submitLabel} />
      </div>
    </form>
  );
}
