"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  completeOnboarding,
  type OnboardingState,
} from "@/lib/actions/onboarding";
import type { Gender } from "@/lib/types/user-profile";

const TOTAL_STEPS = 4;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const initialState: OnboardingState = { error: null };

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((dot) => (
        <span
          key={dot}
          className={`h-2 w-2 rounded-full transition-colors ${
            dot <= step ? "bg-gold" : "bg-line"
          }`}
        />
      ))}
    </div>
  );
}

function CompleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-teal px-8 py-3 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving…" : "Complete"}
    </button>
  );
}

function ContinueButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-teal px-8 py-3 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Continue
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-sans text-sm text-text-soft transition-colors hover:text-ink"
    >
      Back
    </button>
  );
}

export function OnboardingWizard() {
  const [state, formAction] = useActionState(completeOnboarding, initialState);
  const [step, setStep] = useState(1);

  const [name, setName] = useState("");
  const [age, setAge] = useState(30);
  const [gender, setGender] = useState<Gender | "">("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");

  return (
    <div className="flex w-full max-w-md flex-col gap-10">
      <div className="flex flex-col items-center gap-3">
        <span className="font-sans text-xs uppercase tracking-widest text-text-soft">
          Step {step} of {TOTAL_STEPS}
        </span>
        <ProgressDots step={step} />
      </div>

      <form action={formAction} className="flex flex-col items-center gap-8">
        {/* Always mounted so the step-4 submit sends every answer
            collected so far, not just the currently visible step. */}
        <input type="hidden" name="name" value={name} readOnly />
        <input type="hidden" name="age" value={age} readOnly />
        <input type="hidden" name="gender" value={gender} readOnly />
        <input type="hidden" name="height_cm" value={heightCm} readOnly />
        <input type="hidden" name="weight_kg" value={weightKg} readOnly />

        {step === 1 && (
          <div
            key="step-1"
            className="animate-step-in flex w-full flex-col items-center gap-6 text-center"
          >
            <h1 className="font-serif text-3xl italic text-ink sm:text-4xl">
              What should we call you?
            </h1>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full border-b border-line bg-transparent pb-3 text-center font-sans text-xl text-ink placeholder:text-text-soft focus:border-teal focus:outline-none"
            />
            <ContinueButton
              onClick={() => setStep(2)}
              disabled={name.trim().length === 0}
            />
          </div>
        )}

        {step === 2 && (
          <div
            key="step-2"
            className="animate-step-in flex w-full flex-col items-center gap-8 text-center"
          >
            <h1 className="font-serif text-3xl italic text-ink sm:text-4xl">
              How old are you?
            </h1>
            <div className="flex w-full flex-col items-center gap-4">
              <span className="font-serif text-6xl italic text-ink">
                {age}
              </span>
              <input
                type="range"
                min={13}
                max={100}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full accent-teal"
              />
            </div>
            <div className="flex items-center gap-6">
              <BackButton onClick={() => setStep(1)} />
              <ContinueButton onClick={() => setStep(3)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div
            key="step-3"
            className="animate-step-in flex w-full flex-col items-center gap-6 text-center"
          >
            <h1 className="font-serif text-3xl italic text-ink sm:text-4xl">
              How do you identify?
            </h1>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGender(option.value)}
                  className={`rounded-xl border px-5 py-4 font-sans text-sm transition-colors ${
                    gender === option.value
                      ? "border-teal bg-surface text-ink"
                      : "border-line text-text-soft hover:border-text-soft"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-6">
              <BackButton onClick={() => setStep(2)} />
              <ContinueButton
                onClick={() => setStep(4)}
                disabled={gender === ""}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div
            key="step-4"
            className="animate-step-in flex w-full flex-col items-center gap-6 text-center"
          >
            <h1 className="font-serif text-3xl italic text-ink sm:text-4xl">
              Height and weight
            </h1>
            <p className="font-sans text-sm text-text-soft">
              Metric only — centimetres and kilograms.
            </p>
            <div className="flex w-full gap-4">
              <label className="flex flex-1 flex-col gap-1 text-left">
                <span className="font-sans text-xs uppercase tracking-wide text-text-soft">
                  Height (cm)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="170"
                  className="border-b border-line bg-transparent pb-2 font-sans text-lg text-ink placeholder:text-text-soft focus:border-teal focus:outline-none"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-left">
                <span className="font-sans text-xs uppercase tracking-wide text-text-soft">
                  Weight (kg)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="65"
                  className="border-b border-line bg-transparent pb-2 font-sans text-lg text-ink placeholder:text-text-soft focus:border-teal focus:outline-none"
                />
              </label>
            </div>
            {state.error && (
              <p className="font-sans text-sm text-alert" role="alert">
                {state.error}
              </p>
            )}
            <div className="flex items-center gap-6">
              <BackButton onClick={() => setStep(3)} />
              <CompleteButton />
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
