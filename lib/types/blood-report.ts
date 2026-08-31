export type ReportStatus = "processing" | "completed" | "failed";

export type BiomarkerFlag = "normal" | "high" | "low" | "critical";

export interface Biomarker {
  id: string;
  report_id: string;
  category: string | null;
  name: string;
  value: number | null;
  unit: string | null;
  reference_range_low: number | null;
  reference_range_high: number | null;
  flag: BiomarkerFlag | null;
}

export interface BloodReport {
  id: string;
  user_id: string;
  file_path: string;
  lab_name: string | null;
  test_date: string | null;
  uploaded_at: string;
  status: ReportStatus;
  notes: string | null;
  biomarkers: Biomarker[];
}
