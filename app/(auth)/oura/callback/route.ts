import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/oura/client";

const STATE_COOKIE = "oura_oauth_state";
const PROVIDER = "oura";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  const fail = () => NextResponse.redirect(`${origin}/dashboard?oura_error=1`);

  // State mismatch covers both CSRF and the cookie having expired/been
  // cleared — either way we can't trust this callback, so bail the same
  // friendly way rather than distinguishing the reason.
  if (oauthError || !code || !state || !expectedState || state !== expectedState) {
    return fail();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const token = await exchangeCodeForToken(code, origin);
    const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    const { error } = await supabase.from("wearable_connections").upsert(
      {
        user_id: user.id,
        provider: PROVIDER,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: tokenExpiresAt,
        connected_at: new Date().toISOString(),
        last_synced_at: null,
      },
      { onConflict: "user_id,provider" }
    );

    if (error) {
      console.error("[oura] failed to store connection:", error.message);
      return fail();
    }
  } catch (err) {
    console.error("[oura] token exchange failed:", err instanceof Error ? err.message : err);
    return fail();
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
