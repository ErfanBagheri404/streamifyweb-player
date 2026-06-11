import type { Metadata } from "next";
import AuthScreen from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function SignInPage() {
  return <AuthScreen mode="signin" />;
}
