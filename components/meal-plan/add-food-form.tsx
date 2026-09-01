"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addUserFood, type AddFoodState } from "@/lib/actions/meal-plan";
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from "@/lib/types/meal-plan";

const initialState: AddFoodState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-teal px-5 py-2.5 font-sans text-sm font-medium text-teal transition-colors hover:bg-teal hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Looking up…" : "Add food"}
    </button>
  );
}

export function AddFoodForm({ mealPlanId }: { mealPlanId: string }) {
  const [state, formAction] = useActionState(addUserFood, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const prevError = useRef<string | null>(null);

  // Reset only after a submission that just cleared a previous error —
  // never on the very first render, and never while an error is showing.
  useEffect(() => {
    if (prevError.current && !state.error) formRef.current?.reset();
    prevError.current = state.error;
  }, [state.error]);

  return (
    <div className="rounded-[20px] border border-dashed border-line bg-surface p-6">
      <p className="font-sans text-[10px] font-semibold tracking-[0.14em] text-gold uppercase">
        Add a food
      </p>
      <form ref={formRef} action={formAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input type="hidden" name="mealPlanId" value={mealPlanId} />
        <input
          type="text"
          name="foodName"
          placeholder="e.g. salmon, almonds, brown rice"
          required
          className="w-full flex-1 rounded-full border border-line bg-transparent px-4 py-2.5 font-sans text-sm text-ink placeholder:text-text-soft focus:border-teal focus:outline-none"
        />
        <select
          name="mealType"
          defaultValue="snack"
          className="rounded-full border border-line bg-transparent px-4 py-2.5 font-sans text-sm text-ink focus:border-teal focus:outline-none"
        >
          {MEAL_TYPE_ORDER.map((mealType) => (
            <option key={mealType} value={mealType} className="bg-surface text-ink">
              {MEAL_TYPE_LABELS[mealType]}
            </option>
          ))}
        </select>
        <SubmitButton />
      </form>
      {state.error && (
        <p className="mt-2 font-sans text-xs text-alert" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
