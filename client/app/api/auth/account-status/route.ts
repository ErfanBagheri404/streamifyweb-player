import { NextRequest, NextResponse } from "next/server";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectProviders(user: {
  app_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string | null } | null> | null;
}) {
  const providers = new Set<string>();
  const primaryProvider = readTrimmedString(user.app_metadata?.provider);

  if (primaryProvider) {
    providers.add(primaryProvider.toLowerCase());
  }

  const appProviders = user.app_metadata?.providers;
  if (Array.isArray(appProviders)) {
    for (const provider of appProviders) {
      const value = readTrimmedString(provider);
      if (value) {
        providers.add(value.toLowerCase());
      }
    }
  }

  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      const value = readTrimmedString(identity?.provider);
      if (value) {
        providers.add(value.toLowerCase());
      }
    }
  }

  return [...providers];
}

export async function GET(request: NextRequest) {
  const emailParam = request.nextUrl.searchParams.get("email");

  if (!emailParam) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const email = normalizeEmail(emailParam);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        available: false,
        email,
        exists: false,
        duplicate: false,
        providers: [],
        suggestedAction: "unknown",
        error:
          "Account checks are unavailable until SUPABASE_SERVICE_ROLE_KEY is configured.",
      },
      { status: 503 }
    );
  }

  const adminUsersUrl = new URL("/auth/v1/admin/users", supabaseUrl);
  adminUsersUrl.searchParams.set("page", "1");
  adminUsersUrl.searchParams.set("per_page", "100");
  adminUsersUrl.searchParams.set("filter", email);

  const response = await fetch(adminUsersUrl, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    users?: Array<{
      email?: string | null;
      app_metadata?: Record<string, unknown>;
      identities?: Array<{ provider?: string | null } | null> | null;
    }>;
    msg?: string;
    error?: string;
  };

  if (!response.ok) {
    return NextResponse.json(
      { error: payload.msg || payload.error || "Failed to inspect accounts." },
      { status: response.status }
    );
  }

  const exactUsers = (payload.users || []).filter(
    (user) => normalizeEmail(user.email || "") === email
  );
  const duplicate = exactUsers.length > 1;
  const providers = [
    ...new Set(exactUsers.flatMap((user) => collectProviders(user))),
  ];
  const hasEmailProvider = providers.includes("email");
  const hasGoogleProvider = providers.includes("google");

  let suggestedAction = "signup";

  if (duplicate) {
    suggestedAction = "resolve_duplicate";
  } else if (hasEmailProvider && hasGoogleProvider) {
    suggestedAction = "signin_any";
  } else if (hasEmailProvider) {
    suggestedAction = "signin_password";
  } else if (hasGoogleProvider) {
    suggestedAction = "signin_google";
  } else if (exactUsers.length > 0) {
    suggestedAction = "signin_existing";
  }

  return NextResponse.json({
    available: true,
    email,
    exists: exactUsers.length > 0,
    duplicate,
    providers,
    suggestedAction,
  });
}
