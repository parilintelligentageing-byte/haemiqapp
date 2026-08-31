// Server-only Oura v2 Cloud API client. Never imported from a client
// component — access/refresh tokens must never reach the browser.
import type {
  OuraDailyActivityEntry,
  OuraDailyReadinessEntry,
  OuraDailySleepEntry,
  OuraListResponse,
  OuraSleepPeriodEntry,
  OuraTokenResponse,
} from "./types";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API_BASE = "https://api.ouraring.com/v2/usercollection";

// Requested scopes, per the product spec: account email, personal info,
// daily summaries (sleep/readiness/activity), workouts, and stress.
const SCOPES = "email personal daily workout stress";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Oura requires this exact URI to be pre-registered in the app's Oura
// developer dashboard, or the authorize/token calls will be rejected.
export function getOuraRedirectUri(origin: string): string {
  return `${origin}/oura/callback`;
}

export function buildAuthorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("OURA_CLIENT_ID"),
    redirect_uri: getOuraRedirectUri(origin),
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function requestToken(body: Record<string, string>): Promise<OuraTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    throw new Error(`Oura token request failed (${response.status})`);
  }

  return (await response.json()) as OuraTokenResponse;
}

export function exchangeCodeForToken(code: string, origin: string): Promise<OuraTokenResponse> {
  return requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: getOuraRedirectUri(origin),
    client_id: requireEnv("OURA_CLIENT_ID"),
    client_secret: requireEnv("OURA_CLIENT_SECRET"),
  });
}

export function refreshAccessToken(refreshToken: string): Promise<OuraTokenResponse> {
  return requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: requireEnv("OURA_CLIENT_ID"),
    client_secret: requireEnv("OURA_CLIENT_SECRET"),
  });
}

async function fetchOura<T>(
  path: string,
  accessToken: string,
  date: string
): Promise<OuraListResponse<T>> {
  const params = new URLSearchParams({ start_date: date, end_date: date });
  const response = await fetch(`${API_BASE}/${path}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new OuraAuthError(`Oura rejected the access token for ${path}`);
  }
  if (!response.ok) {
    throw new Error(`Oura API request to ${path} failed (${response.status})`);
  }

  return (await response.json()) as OuraListResponse<T>;
}

// Distinguishes "the connection needs to be re-authorized" from any
// other failure, so callers can react by clearing the stored connection
// rather than surfacing a raw error.
export class OuraAuthError extends Error {}

export interface OuraDailySnapshot {
  sleepScore: number | null;
  readinessScore: number | null;
  activityScore: number | null;
  restingHeartRate: number | null;
  hrvAvg: number | null;
  raw: {
    sleep: OuraDailySleepEntry | null;
    readiness: OuraDailyReadinessEntry | null;
    activity: OuraDailyActivityEntry | null;
    sleepPeriod: OuraSleepPeriodEntry | null;
  };
}

// Fetches one day's recovery snapshot. Any endpoint returning no rows —
// the expected case before a ring has synced its first night — just
// leaves that part of the snapshot null instead of throwing.
export async function fetchDailySnapshot(
  accessToken: string,
  date: string
): Promise<OuraDailySnapshot> {
  const [sleepRes, readinessRes, activityRes, sleepPeriodRes] = await Promise.all([
    fetchOura<OuraDailySleepEntry>("daily_sleep", accessToken, date),
    fetchOura<OuraDailyReadinessEntry>("daily_readiness", accessToken, date),
    fetchOura<OuraDailyActivityEntry>("daily_activity", accessToken, date),
    fetchOura<OuraSleepPeriodEntry>("sleep", accessToken, date),
  ]);

  const sleep = sleepRes.data[0] ?? null;
  const readiness = readinessRes.data[0] ?? null;
  const activity = activityRes.data[0] ?? null;
  const sleepPeriod =
    sleepPeriodRes.data.find((p) => p.type === "long_sleep") ?? sleepPeriodRes.data[0] ?? null;

  return {
    sleepScore: sleep?.score ?? null,
    readinessScore: readiness?.score ?? null,
    activityScore: activity?.score ?? null,
    restingHeartRate: sleepPeriod?.average_heart_rate ?? null,
    hrvAvg: sleepPeriod?.average_hrv ?? null,
    raw: { sleep, readiness, activity, sleepPeriod },
  };
}
