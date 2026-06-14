import type { Metadata } from "next";
import AuthScreen from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function SignUpPage() {
  return (
    <main data-auth-page="true" className="flex-1">
      <AuthScreen mode="signup" />
    </main>
  );
}
