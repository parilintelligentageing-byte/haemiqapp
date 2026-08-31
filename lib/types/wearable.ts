export interface WearableConnection {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  connected_at: string;
  last_synced_at: string | null;
}

export interface WearableDailyData {
  id: string;
  user_id: string;
  provider: string;
  date: string;
  sleep_score: number | null;
  readiness_score: number | null;
  activity_score: number | null;
  resting_heart_rate: number | null;
  hrv_avg: number | null;
  raw_json: unknown;
  created_at: string;
}
