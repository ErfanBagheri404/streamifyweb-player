import type { Metadata } from "next";
import AuthScreen from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Forgot Password",
};

export default function ForgotPasswordPage() {
  return (
    <main data-auth-page="true" className="flex-1">
      <AuthScreen mode="forgot-password" />
    </main>
  );
}
