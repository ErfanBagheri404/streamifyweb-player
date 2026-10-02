import { redirect } from "next/navigation";
import { randomNonce } from "../../lib/device-grant";
import { getSupabaseServerClient } from "../../lib/supabase/server";

interface DesktopPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// GET /auth/desktop — human confirm page for the desktop auth handoff.
// Session-gated: no session -> 302 to /signin?next=<this page + query>, so
// sign-in completes first and the validated ?next= brings the user back here.
export default async function DesktopAuthPage({
  searchParams,
}: DesktopPageProps) {
  const params = await searchParams;
  const challenge = first(params.challenge);
  const state = first(params.state);
  const device = first(params.device) || "Streamify Desktop";
  // Desktop normally supplies the nonce so it can check the deep link reply.
  const nonce = first(params.nonce) || randomNonce();

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const carry = new URLSearchParams();
    if (challenge) carry.set("challenge", challenge);
    if (state) carry.set("state", state);
    if (device) carry.set("device", device);
    if (first(params.nonce)) carry.set("nonce", first(params.nonce));
    const next = `/auth/desktop${carry.size ? `?${carry}` : ""}`;
    redirect(`/signin?next=${encodeURIComponent(next)}`);
  }

  if (!challenge || !state) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold">Invalid desktop sign-in request</h1>
        <p className="text-sm opacity-70">
          This page is opened by the Streamify Desktop app. Please start
          sign-in again from the app.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-xl font-bold">Authorize {device}?</h1>
      <p className="text-sm opacity-70">
        Signed in as {user.email ?? user.id}. The desktop app is asking for
        access to your Streamify account. Only approve this if you just started
        sign-in from the app on this device.
      </p>
      <form method="POST" action="/api/auth/device/approve">
        <input type="hidden" name="challenge" value={challenge} />
        <input type="hidden" name="nonce" value={nonce} />
        <input type="hidden" name="state" value={state} />
        <button
          type="submit"
          className="rounded-xl bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] hover:bg-white/95"
        >
          Authorize
        </button>
      </form>
      <p className="text-xs opacity-50">
        Approval lasts 2 minutes, works once, and never shares your password.
        After authorizing, your browser asks which app opens the sign-in link
        — pick Streamify Desktop (while the app is in development the entry
        may be labelled Electron).
      </p>
    </main>
  );
}
