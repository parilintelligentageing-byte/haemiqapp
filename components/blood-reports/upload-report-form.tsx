"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { uploadBloodReport, type UploadState } from "@/lib/actions/blood-reports";

const initialState: UploadState = { success: false, error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="border border-ink px-5 py-2 font-sans text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/40 disabled:hover:bg-transparent disabled:hover:text-ink/40"
    >
      {pending ? "Reading your blood…" : "Upload New Report"}
    </button>
  );
}

export function UploadReportForm() {
  const [state, formAction] = useActionState(uploadBloodReport, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the file input after a successful upload so the form is ready
  // for the next one instead of showing a stale filename.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col items-start gap-3"
    >
      <label className="flex flex-col gap-1 font-sans text-sm text-grey">
        <span>Upload a blood test report (PDF, up to 10MB)</span>
        <input
          type="file"
          name="file"
          accept="application/pdf"
          required
          className="font-sans text-sm text-ink file:mr-4 file:border file:border-ink/20 file:bg-transparent file:px-3 file:py-1.5 file:font-sans file:text-sm file:text-ink file:transition-colors hover:file:border-ink"
        />
      </label>
      <SubmitButton />
      {state.error && (
        <p className="font-sans text-sm text-blood" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
