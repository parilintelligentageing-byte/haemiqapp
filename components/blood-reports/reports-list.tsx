"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  retryBloodReportExtraction,
  updateReportDate,
} from "@/lib/actions/blood-reports";
import { isNoBiomarkersFailure } from "@/lib/blood-report-failure";
import type { Biomarker, BloodReport } from "@/lib/types/blood-report";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Date pending";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function failureMessage(report: BloodReport): string {
  if (isNoBiomarkersFailure(report.notes)) {
    return "This didn't look like a blood report — try a different file.";
  }
  return "Something went wrong processing this report. Try uploading again.";
}

function StatusBadge({ status }: { status: BloodReport["status"] }) {
  if (status === "processing") {
    return (
      <span className="font-sans text-xs uppercase tracking-wide text-grey">
        Processing…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="font-sans text-xs uppercase tracking-wide text-blood">
        Failed
      </span>
    );
  }
  return (
    <span className="font-sans text-xs uppercase tracking-wide text-grey">
      Completed
    </span>
  );
}

function RetrySubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-sans text-xs font-medium text-teal underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}

function RetryForm({ reportId }: { reportId: string }) {
  const [state, formAction] = useActionState(retryBloodReportExtraction, {
    error: null,
  });

  return (
    <form
      action={formAction}
      onClick={(e) => e.stopPropagation()}
      className="mt-1 flex items-center gap-2"
    >
      <input type="hidden" name="reportId" value={reportId} />
      <RetrySubmitButton />
      {state.error && (
        <span className="font-sans text-xs text-alert">{state.error}</span>
      )}
    </form>
  );
}

function SaveDateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-teal px-3 py-1 font-sans text-xs font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function EditableDate({ reportId }: { reportId: string }) {
  const [state, formAction] = useActionState(updateReportDate, {
    error: null,
  });
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="text-left font-serif text-xl italic text-text-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
      >
        Date unknown — click to add manually
      </button>
    );
  }

  return (
    <form
      action={formAction}
      onClick={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="reportId" value={reportId} />
      <input
        type="date"
        name="test_date"
        autoFocus
        className="border-b border-line bg-transparent font-sans text-sm text-ink focus:border-teal focus:outline-none"
      />
      <SaveDateButton />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(false);
        }}
        className="font-sans text-xs text-text-soft transition-colors hover:text-ink"
      >
        Cancel
      </button>
      {state.error && (
        <span className="w-full font-sans text-xs text-alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

function groupByCategory(biomarkers: Biomarker[]) {
  const groups = new Map<string, Biomarker[]>();
  for (const biomarker of biomarkers) {
    const key = biomarker.category ?? "Other";
    const existing = groups.get(key);
    if (existing) {
      existing.push(biomarker);
    } else {
      groups.set(key, [biomarker]);
    }
  }
  return groups;
}

function isAbnormal(flag: Biomarker["flag"]) {
  return flag === "high" || flag === "low" || flag === "critical";
}

function BiomarkerTable({ biomarkers }: { biomarkers: Biomarker[] }) {
  const groups = groupByCategory(biomarkers);

  return (
    <div className="flex flex-col gap-6 border-t border-ink/10 px-1 py-5">
      {[...groups.entries()].map(([category, items]) => (
        <div key={category}>
          <h3 className="font-serif italic text-lg text-ink">{category}</h3>
          <table className="mt-2 w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-grey">
                <th className="py-1.5 pr-4 font-normal">Biomarker</th>
                <th className="py-1.5 pr-4 font-normal">Value</th>
                <th className="py-1.5 pr-4 font-normal">Reference range</th>
                <th className="py-1.5 font-normal">Flag</th>
              </tr>
            </thead>
            <tbody>
              {items.map((biomarker) => {
                const abnormal = isAbnormal(biomarker.flag);
                return (
                  <tr
                    key={biomarker.id}
                    className="border-b border-ink/5 last:border-0"
                  >
                    <td className="py-1.5 pr-4 text-ink">{biomarker.name}</td>
                    <td
                      className={`py-1.5 pr-4 ${abnormal ? "font-medium text-blood" : "text-ink"}`}
                    >
                      {biomarker.value ?? "—"} {biomarker.unit ?? ""}
                    </td>
                    <td className="py-1.5 pr-4 text-grey">
                      {biomarker.reference_range_low ?? "—"}–
                      {biomarker.reference_range_high ?? "—"}
                    </td>
                    <td
                      className={`py-1.5 capitalize ${abnormal ? "font-medium text-blood" : "text-ink"}`}
                    >
                      {biomarker.flag ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ReportRow({ report }: { report: BloodReport }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = report.status === "completed" && report.biomarkers.length > 0;
  const needsDate = report.status === "completed" && !report.test_date;

  return (
    <div className="border-b border-ink/10">
      {/* A plain div, not a <button> — it now contains nested interactive
          elements (the retry form, the date editor) which can't legally
          live inside a real <button>. */}
      <div
        role="button"
        tabIndex={canExpand ? 0 : undefined}
        onClick={() => canExpand && setExpanded((value) => !value)}
        onKeyDown={(e) => {
          if (canExpand && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded((value) => !value);
          }
        }}
        className={`flex w-full items-center justify-between gap-4 py-4 text-left ${
          canExpand ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="flex flex-col gap-1">
          {needsDate ? (
            <EditableDate reportId={report.id} />
          ) : (
            <span className="font-serif italic text-xl text-ink">
              {formatDate(report.test_date)}
            </span>
          )}
          <span className="font-sans text-sm text-grey">
            {report.lab_name ?? "Lab pending"} · {report.biomarkers.length}{" "}
            biomarker{report.biomarkers.length === 1 ? "" : "s"}
          </span>
          {report.status === "failed" && (
            <div className="mt-1 flex flex-col items-start gap-1">
              <span className="font-sans text-xs text-blood">
                {failureMessage(report)}
              </span>
              <RetryForm reportId={report.id} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={report.status} />
          {canExpand && (
            <span className="font-sans text-sm text-ink/50">
              {expanded ? "−" : "+"}
            </span>
          )}
        </div>
      </div>
      {expanded && canExpand && (
        <BiomarkerTable biomarkers={report.biomarkers} />
      )}
    </div>
  );
}

export function ReportsList({ reports }: { reports: BloodReport[] }) {
  if (reports.length === 0) {
    return (
      <p className="font-sans text-sm text-grey">
        No reports yet — upload your first blood test above.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {reports.map((report) => (
        <ReportRow key={report.id} report={report} />
      ))}
    </div>
  );
}
