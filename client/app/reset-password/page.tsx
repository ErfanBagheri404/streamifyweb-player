import type { Metadata } from "next";
import AuthScreen from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Reset Password",
};

export default function ResetPasswordPage() {
  return (
    <main data-auth-page="true" className="flex-1">
      <AuthScreen mode="reset-password" />
    </main>
  );
}
