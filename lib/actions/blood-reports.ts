"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { anthropic } from "@/lib/anthropic/client";
import { NO_BIOMARKERS_MARKER } from "@/lib/blood-report-failure";
import type { Biomarker, BiomarkerFlag, BloodReport } from "@/lib/types/blood-report";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    lab_name: { anyOf: [{ type: "string" }, { type: "null" }] },
    test_date: { anyOf: [{ type: "string" }, { type: "null" }] },
    biomarkers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          name: { type: "string" },
          value: { type: "number" },
          unit: { type: "string" },
          reference_range_low: { anyOf: [{ type: "number" }, { type: "null" }] },
          reference_range_high: { anyOf: [{ type: "number" }, { type: "null" }] },
          flag: { type: "string", enum: ["normal", "high", "low", "critical"] },
        },
        required: [
          "category",
          "name",
          "value",
          "unit",
          "reference_range_low",
          "reference_range_high",
          "flag",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["lab_name", "test_date", "biomarkers"],
  additionalProperties: false,
} as const;

const EXTRACTION_SYSTEM_PROMPT = `You are a clinical lab report parser. You will be given a blood test report as a PDF. Extract every biomarker/test result found in the report.

For each biomarker:
- category: the panel or section it belongs to (e.g. "Complete Blood Count", "Lipid Panel", "Liver Function", "Kidney Function", "Thyroid Panel", "Metabolic Panel", "Vitamins", "Hormones"). Infer a reasonable category if the report doesn't label one explicitly.
- name: the biomarker's name as printed (e.g. "Hemoglobin", "LDL Cholesterol").
- value: the numeric result. Skip rows whose result is qualitative or non-numeric.
- unit: the unit as printed (e.g. "g/dL", "mg/dL").
- reference_range_low / reference_range_high: the lab's stated normal range, split into two numbers. Use null for a bound the report doesn't provide.
- flag: compare value against the reference range. "normal" if within range, "low" if below, "high" if above. Use "critical" only if the report itself marks the result as critical, panic, or severely abnormal.

Also extract:
- lab_name: the name of the lab or clinic that issued the report, or null if not printed.
- test_date: the date the sample was collected or the report was issued, formatted as YYYY-MM-DD, or null if not found.

Extract every biomarker present in the report — do not skip rows for brevity.`;

interface ExtractedPayload {
  lab_name: string | null;
  test_date: string | null;
  biomarkers: Array<{
    category: string;
    name: string;
    value: number;
    unit: string;
    reference_range_low: number | null;
    reference_range_high: number | null;
    flag: BiomarkerFlag;
  }>;
}

// Accepts only a strict YYYY-MM-DD string and rejects anything that
// isn't a real calendar date (garbled OCR/extraction like "2X-12-02",
// or a rolled-over date like "2024-13-45"). Returns null rather than
// throwing so a bad date never takes down the rest of the report.
function toSafeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const roundTrips =
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day;
    return roundTrips ? value : null;
  } catch {
    return null;
  }
}

// Coerces a possibly-garbled extracted value to a finite number, or
// null if it isn't one — used for value/reference_range_low/high so a
// bad field nulls itself out instead of failing the whole insert.
function toSafeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export interface UploadState {
  success: boolean;
  error: string | null;
}

export async function uploadBloodReport(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Choose a PDF file first." };
  }

  if (file.type !== "application/pdf") {
    return { success: false, error: "Only PDF files are supported." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { success: false, error: "File is too large (max 10MB)." };
  }

  const reportId = randomUUID();
  const filePath = `${user.id}/${reportId}.pdf`;
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("blood-reports")
    .upload(filePath, fileBytes, { contentType: "application/pdf" });

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { error: insertError } = await supabase.from("blood_reports").insert({
    id: reportId,
    user_id: user.id,
    file_path: filePath,
    status: "processing",
  });

  if (insertError) {
    return {
      success: false,
      error: `Could not save the report: ${insertError.message}`,
    };
  }

  // Extraction runs inline so the client's pending state ("Reading your
  // blood...") covers the full upload + AI round trip. Failures here are
  // recorded on the row rather than thrown — the upload itself already
  // succeeded, and the UI should show a failed report, not a crashed action.
  await extractBiomarkers({ supabase, userId: user.id, reportId, fileBytes });

  revalidatePath("/dashboard");

  return { success: true, error: null };
}

async function extractBiomarkers({
  supabase,
  userId,
  reportId,
  fileBytes,
}: {
  supabase: SupabaseServerClient;
  userId: string;
  reportId: string;
  fileBytes: Uint8Array;
}) {
  try {
    const base64Pdf = Buffer.from(fileBytes).toString("base64");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: EXTRACTION_SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text: "Extract every biomarker from this blood test report.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined to process this document.");
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(
        `No text content in Claude's response (stop_reason: ${response.stop_reason}).`
      );
    }

    // Dev visibility into what Claude actually extracted — useful for
    // debugging mis-parsed reports.
    console.log(`[blood-report ${reportId}] Claude response:`, textBlock.text);

    const parsed = JSON.parse(textBlock.text) as ExtractedPayload;

    // No biomarkers at all is the only case that counts as a real
    // failure — a bad date or a couple of garbled numeric fields on an
    // otherwise-good extraction should still save as completed.
    if (parsed.biomarkers.length === 0) {
      console.log(
        `[blood-report ${reportId}] no biomarkers extracted — likely not a blood report.`
      );
      await supabase
        .from("blood_reports")
        .update({ status: "failed", notes: NO_BIOMARKERS_MARKER })
        .eq("id", reportId)
        .eq("user_id", userId);
      return;
    }

    const { error: biomarkersError } = await supabase.from("biomarkers").insert(
      parsed.biomarkers.map((b) => ({
        report_id: reportId,
        category: b.category,
        name: b.name,
        value: toSafeNumber(b.value),
        unit: b.unit,
        reference_range_low: toSafeNumber(b.reference_range_low),
        reference_range_high: toSafeNumber(b.reference_range_high),
        flag: b.flag,
      }))
    );

    if (biomarkersError) {
      throw new Error(`Could not save biomarkers: ${biomarkersError.message}`);
    }

    const { error: updateError } = await supabase
      .from("blood_reports")
      .update({
        lab_name: parsed.lab_name,
        test_date: toSafeIsoDate(parsed.test_date),
        status: "completed",
      })
      .eq("id", reportId)
      .eq("user_id", userId);

    if (updateError) {
      throw new Error(`Could not finalize report: ${updateError.message}`);
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown extraction error.";
    console.error(`[blood-report ${reportId}] extraction failed:`, message);

    await supabase
      .from("blood_reports")
      .update({ status: "failed", notes: `ERROR: ${message}` })
      .eq("id", reportId)
      .eq("user_id", userId);
  }
}

export interface RetryState {
  error: string | null;
}

export async function retryBloodReportExtraction(
  _prevState: RetryState,
  formData: FormData
): Promise<RetryState> {
  const reportId = formData.get("reportId") as string | null;
  if (!reportId) {
    return { error: "Missing report id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data: report, error: reportError } = await supabase
    .from("blood_reports")
    .select("file_path")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (reportError || !report) {
    return { error: "Report not found." };
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("blood-reports")
    .download(report.file_path);

  if (downloadError || !fileData) {
    console.error(
      `[blood-report ${reportId}] retry download failed:`,
      downloadError?.message
    );
    return { error: "Could not re-download the file for this report." };
  }

  // Clear any biomarkers left over from a previous attempt so retries
  // never accumulate duplicate rows.
  await supabase.from("biomarkers").delete().eq("report_id", reportId);

  const fileBytes = new Uint8Array(await fileData.arrayBuffer());
  await extractBiomarkers({ supabase, userId: user.id, reportId, fileBytes });

  revalidatePath("/dashboard");

  return { error: null };
}

export interface UpdateDateState {
  error: string | null;
}

export async function updateReportDate(
  _prevState: UpdateDateState,
  formData: FormData
): Promise<UpdateDateState> {
  const reportId = formData.get("reportId") as string | null;
  if (!reportId) {
    return { error: "Missing report id." };
  }

  const safeDate = toSafeIsoDate(formData.get("test_date") as string | null);
  if (!safeDate) {
    return { error: "Enter a valid date." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("blood_reports")
    .update({ test_date: safeDate })
    .eq("id", reportId)
    .eq("user_id", user.id);

  if (error) {
    console.error(`[blood-report ${reportId}] date update failed:`, error.message);
    return { error: "Could not save the date." };
  }

  revalidatePath("/dashboard");
  return { error: null };
}

export async function getBloodReports(): Promise<BloodReport[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("blood_reports")
    .select("*, biomarkers(*)")
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch blood reports:", error.message);
    return [];
  }

  return (data ?? []) as BloodReport[];
}

// Fetches just the latest completed report's biomarkers, without pulling
// every report the user has ever uploaded (unlike getBloodReports) — for
// callers that only ever need the current picture, e.g. meal plan context.
export async function getLatestCompletedBiomarkers(): Promise<Biomarker[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("blood_reports")
    .select("biomarkers(*)")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch latest completed biomarkers:", error.message);
    return [];
  }

  return (data?.biomarkers as Biomarker[] | undefined) ?? [];
}
