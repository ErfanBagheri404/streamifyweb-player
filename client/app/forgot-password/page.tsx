import type { Metadata } from "next";
import AuthScreen from "../components/AuthScreen";
import { getSafeNextPath } from "../lib/auth-routes";

export const metadata: Metadata = {
  title: "Forgot Password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = getSafeNextPath(
    typeof params.next === "string" ? params.next : null
  );

  return (
    <main data-auth-page="true" className="flex-1">
      <AuthScreen mode="forgot-password" next={next} />
    </main>
  );
}
