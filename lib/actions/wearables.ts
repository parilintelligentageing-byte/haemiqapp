"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  fetchDailySnapshot,
  OuraAuthError,
  refreshAccessToken,
} from "@/lib/oura/client";
import type { WearableConnection, WearableDailyData } from "@/lib/types/wearable";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const PROVIDER = "oura";
const SYNC_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min ahead of actual expiry

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getConnection(
  supabase: SupabaseServerClient,
  userId: string
): Promise<WearableConnection | null> {
  const { data, error } = await supabase
    .from("wearable_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (error) {
    console.error(`[oura ${userId}] failed to load connection:`, error.message);
    return null;
  }
  return (data as WearableConnection | null) ?? null;
}

async function dropConnection(supabase: SupabaseServerClient, userId: string) {
  const { error } = await supabase
    .from("wearable_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", PROVIDER);
  if (error) {
    console.error(`[oura ${userId}] failed to drop connection:`, error.message);
  }
}

// Ensures we have a valid access token, refreshing first if it's expired
// or about to be. Returns null (and drops the stored connection) only
// when the refresh token itself has been revoked — the one case that
// genuinely requires the user to reconnect.
async function ensureFreshToken(
  supabase: SupabaseServerClient,
  userId: string,
  connection: WearableConnection
): Promise<string | null> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return connection.access_token;
  }

  try {
    const refreshed = await refreshAccessToken(connection.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    const { error } = await supabase
      .from("wearable_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: tokenExpiresAt,
      })
      .eq("user_id", userId)
      .eq("provider", PROVIDER);
    if (error) {
      console.error(`[oura ${userId}] failed to store refreshed token:`, error.message);
    }

    return refreshed.access_token;
  } catch (err) {
    console.error(
      `[oura ${userId}] token refresh failed:`,
      err instanceof Error ? err.message : err
    );
    await dropConnection(supabase, userId);
    return null;
  }
}

async function syncToday(
  supabase: SupabaseServerClient,
  userId: string,
  connection: WearableConnection
): Promise<{ expired: boolean; syncIssue: boolean }> {
  const accessToken = await ensureFreshToken(supabase, userId, connection);
  if (!accessToken) {
    return { expired: true, syncIssue: false };
  }

  const date = todayIso();

  try {
    const snapshot = await fetchDailySnapshot(accessToken, date);

    const { error: upsertError } = await supabase.from("wearable_daily_data").upsert(
      {
        user_id: userId,
        provider: PROVIDER,
        date,
        sleep_score: snapshot.sleepScore,
        readiness_score: snapshot.readinessScore,
        activity_score: snapshot.activityScore,
        resting_heart_rate: snapshot.restingHeartRate,
        hrv_avg: snapshot.hrvAvg,
        raw_json: snapshot.raw,
      },
      { onConflict: "user_id,provider,date" }
    );
    if (upsertError) {
      throw new Error(`Could not save daily data: ${upsertError.message}`);
    }

    const { error: updateError } = await supabase
      .from("wearable_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", PROVIDER);
    if (updateError) {
      throw new Error(`Could not update last_synced_at: ${updateError.message}`);
    }

    return { expired: false, syncIssue: false };
  } catch (err) {
    if (err instanceof OuraAuthError) {
      await dropConnection(supabase, userId);
      return { expired: true, syncIssue: false };
    }
    console.error(`[oura ${userId}] sync failed:`, err instanceof Error ? err.message : err);
    return { expired: false, syncIssue: true };
  }
}

export type RecoveryConnectionState = "not_connected" | "expired" | "connected";

export interface RecoveryData {
  state: RecoveryConnectionState;
  today: WearableDailyData | null;
  syncIssue: boolean;
}

export async function getRecoveryData(): Promise<RecoveryData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { state: "not_connected", today: null, syncIssue: false };
  }

  const connection = await getConnection(supabase, user.id);
  if (!connection) {
    return { state: "not_connected", today: null, syncIssue: false };
  }

  let syncIssue = false;
  const lastSynced = connection.last_synced_at
    ? new Date(connection.last_synced_at).getTime()
    : 0;

  if (Date.now() - lastSynced > SYNC_STALE_MS) {
    const result = await syncToday(supabase, user.id, connection);
    if (result.expired) {
      return { state: "expired", today: null, syncIssue: false };
    }
    syncIssue = result.syncIssue;
  }

  const { data: today, error: todayError } = await supabase
    .from("wearable_daily_data")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", PROVIDER)
    .eq("date", todayIso())
    .maybeSingle();
  if (todayError) {
    console.error(`[oura ${user.id}] failed to load today's data:`, todayError.message);
  }

  return { state: "connected", today: (today as WearableDailyData | null) ?? null, syncIssue };
}

export async function disconnectOura(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await dropConnection(supabase, user.id);
  revalidatePath("/dashboard");
}

// Dev-only: seeds one realistic-looking row so the Recovery UI's real
// design can be verified before a real ring is connected. NODE_ENV is
// re-checked here — this is the check that actually matters, since it
// runs server-side regardless of whether the calling button is visible.
export async function seedDevFakeData(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Dev data seeding is not available outside development.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date();

  const { error: connectionError } = await supabase.from("wearable_connections").upsert(
    {
      user_id: user.id,
      provider: PROVIDER,
      access_token: "dev-fake-access-token",
      refresh_token: "dev-fake-refresh-token",
      token_expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      last_synced_at: now.toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (connectionError) {
    console.error(`[oura dev-seed ${user.id}] connection upsert failed:`, connectionError.message);
    throw new Error(`Dev seed failed: ${connectionError.message}`);
  }

  const { error: dailyDataError } = await supabase.from("wearable_daily_data").upsert(
    {
      user_id: user.id,
      provider: PROVIDER,
      date: todayIso(),
      sleep_score: 84,
      readiness_score: 78,
      activity_score: 91,
      resting_heart_rate: 54,
      hrv_avg: 62,
      raw_json: { dev_seed: true },
    },
    { onConflict: "user_id,provider,date" }
  );
  if (dailyDataError) {
    console.error(`[oura dev-seed ${user.id}] daily data upsert failed:`, dailyDataError.message);
    throw new Error(`Dev seed failed: ${dailyDataError.message}`);
  }

  revalidatePath("/dashboard");
}
