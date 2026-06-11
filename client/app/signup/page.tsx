import type { Metadata } from "next";
import AuthScreen from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function SignUpPage() {
  return <AuthScreen mode="signup" />;
}
