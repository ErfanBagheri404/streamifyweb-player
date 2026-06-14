import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";

function getSafeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/")) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(next, requestUrl.origin);

  if (!code) {
    redirectUrl.searchParams.set("auth_error", "missing_code");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      redirectUrl.searchParams.set("auth_error", error.message);
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    redirectUrl.searchParams.set(
      "auth_error",
      error instanceof Error ? error.message : "Authentication failed"
    );
    return NextResponse.redirect(redirectUrl);
  }
}
