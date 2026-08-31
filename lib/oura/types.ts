// Oura v2 Cloud API — shapes for the endpoints this integration calls.
// Only the fields we actually read are typed; the full response is kept
// in raw_json for anything else. Field names follow Oura's public v2
// docs as of this build — worth re-verifying once a real ring starts
// producing data, since this has only been tested against a ringless
// account (auth works, but there's nothing to sync yet).

export interface OuraTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds until the access token expires
  token_type: string;
  scope: string;
}

export interface OuraDailySleepEntry {
  id: string;
  day: string; // YYYY-MM-DD
  score: number | null;
}

export interface OuraDailyReadinessEntry {
  id: string;
  day: string;
  score: number | null;
}

export interface OuraDailyActivityEntry {
  id: string;
  day: string;
  score: number | null;
}

// A single sleep period (e.g. "long_sleep", "short_sleep", "late_nap") —
// this is where raw physiological averages live, not on daily_sleep.
export interface OuraSleepPeriodEntry {
  id: string;
  day: string;
  type: string;
  average_heart_rate: number | null;
  average_hrv: number | null;
}

export interface OuraListResponse<T> {
  data: T[];
  next_token: string | null;
}
