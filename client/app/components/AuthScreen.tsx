"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAppLanguage } from "../hooks/useAppLanguage";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";
import { getBaseUrl } from "../lib/supabase/config";

type AuthMode = "signin" | "signup" | "forgot-password" | "reset-password";

interface AuthScreenProps {
  mode: AuthMode;
}

type AccountStatusResponse = {
  available: boolean;
  exists: boolean;
  duplicate: boolean;
  providers: string[];
  suggestedAction: string;
  error?: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12.24 10.285v3.821h5.445c-.24 1.247-.96 2.303-2.043 3.013l3.304 2.565c1.923-1.772 3.034-4.378 3.034-7.47 0-.706-.064-1.384-.18-2.043h-9.56Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.896 6.618-2.43l-3.304-2.565c-.915.614-2.085.98-3.314.98-2.548 0-4.709-1.72-5.48-4.033H3.104v2.635A9.996 9.996 0 0 0 12 22Z"
      />
      <path
        fill="#4A90E2"
        d="M6.52 13.952A5.997 5.997 0 0 1 6.214 12c0-.678.116-1.337.306-1.952V7.413H3.104A9.996 9.996 0 0 0 2 12c0 1.61.385 3.135 1.104 4.587l3.416-2.635Z"
      />
      <path
        fill="#FBBC05"
        d="M12 6.016c1.47 0 2.785.505 3.821 1.495l2.868-2.868C16.955 3.032 14.691 2 12 2A9.996 9.996 0 0 0 3.104 7.413l3.416 2.635C7.29 7.736 9.452 6.016 12 6.016Z"
      />
    </svg>
  );
}

function PasswordEyeGlyph({ visible }: { visible: boolean }) {
  return visible ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a17.46 17.46 0 0 1-3.06 3.77"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.71 6.72A17.72 17.72 0 0 0 2 12s3.5 7 10 7a10.94 10.94 0 0 0 5.29-1.28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AuthScreen({ mode }: AuthScreenProps) {
  const { t, isRtl } = useAppLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRecoveryReady, setIsRecoveryReady] = useState(
    mode !== "reset-password"
  );

  const isSignUp = mode === "signup";
  const isForgotPassword = mode === "forgot-password";
  const isResetPassword = mode === "reset-password";
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const authUnavailableMessage =
    "Authentication is unavailable until Supabase environment variables are configured.";
  const passwordTogglePositionClass = isRtl ? "left-0 pl-3" : "right-0 pr-3";
  const heroTitle = isRtl
    ? "دقيقا از همان جايي که بودي ادامه بده"
    : "Pick Up Exactly Where You Left Off";
  const heroDescription = isRtl
    ? "تنظيمات ذخيره شده، ترجيحات پخش و روند جستجوي شما هر زمان که برگرديد آماده هستند."
    : "Saved settings, playback preferences, and your search flow are ready whenever you come back.";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const value = new URLSearchParams(window.location.search).get("auth_error");
    setAuthError(value);
  }, []);

  useEffect(() => {
    if (!authError) return;

    if (/multiple accounts with the same email address/i.test(authError)) {
      setErrorMessage(t("auth.multipleAccountsDetected"));
      return;
    }

    if (/missing_code/i.test(authError)) {
      setErrorMessage(t("auth.googleSignInIncomplete"));
      return;
    }

    setErrorMessage(authError);
  }, [authError, t]);

  useEffect(() => {
    if (!isResetPassword || !supabase) return;

    let isMounted = true;

    const hydrateRecovery = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (session) {
        setIsRecoveryReady(true);
      }
    };

    void hydrateRecovery();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === "PASSWORD_RECOVERY" || session) {
        setIsRecoveryReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isResetPassword, supabase]);

  const checkAccountStatus = async (
    rawEmail: string
  ): Promise<AccountStatusResponse | null> => {
    const normalizedEmail = normalizeEmail(rawEmail);

    if (!normalizedEmail) return null;

    try {
      const params = new URLSearchParams({ email: normalizedEmail });
      const response = await fetch(`/api/auth/account-status?${params}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as AccountStatusResponse;

      return response.ok ? payload : payload;
    } catch {
      return null;
    }
  };

  const getExistingAccountMessage = (
    status: AccountStatusResponse,
    intent: "signup" | "password" | "google"
  ) => {
    if (status.duplicate) {
      return t("auth.multipleAccountsDetected");
    }

    const hasEmailProvider = status.providers.includes("email");
    const hasGoogleProvider = status.providers.includes("google");

    if (intent === "google") {
      if (hasEmailProvider && !hasGoogleProvider) {
        return t("auth.usePasswordInsteadOfGoogle");
      }

      return null;
    }

    if (intent === "password") {
      if (hasGoogleProvider && !hasEmailProvider) {
        return t("auth.useGoogleInsteadOfPassword");
      }

      return null;
    }

    if (hasGoogleProvider && !hasEmailProvider) {
      return t("auth.accountAlreadyExistsWithGoogle");
    }

    if (status.exists) {
      return t("auth.accountAlreadyExistsSignIn");
    }

    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);

    const normalizedEmail = normalizeEmail(email);

    if (isForgotPassword) {
      if (!email.trim()) {
        setErrorMessage(t("auth.enterEmailForReset"));
        return;
      }

      if (!supabase) {
        setErrorMessage(authUnavailableMessage);
        return;
      }

      setIsSubmitting(true);

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: `${getBaseUrl()}/reset-password`,
          }
        );

        if (error) throw error;

        setMessage(t("auth.resetPasswordEmailSent"));
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : t("auth.genericError")
        );
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    if (isResetPassword) {
      if (!password.trim() || !confirmPassword.trim()) {
        setErrorMessage(t("auth.fillAllFields"));
        return;
      }

      if (password.trim() !== confirmPassword.trim()) {
        setErrorMessage(t("auth.passwordsDoNotMatch"));
        return;
      }

      if (!supabase) {
        setErrorMessage(authUnavailableMessage);
        return;
      }

      if (!isRecoveryReady) {
        setErrorMessage(t("auth.resetPasswordLinkInvalid"));
        return;
      }

      setIsSubmitting(true);

      try {
        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;

        setMessage(t("auth.passwordUpdated"));
        router.replace("/signin");
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : t("auth.genericError")
        );
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    if (isSignUp && password.trim() !== confirmPassword.trim()) {
      setErrorMessage(t("auth.passwordsDoNotMatch"));
      return;
    }

    if (!email.trim() || !password.trim()) {
      setErrorMessage(t("auth.fillAllFields"));
      return;
    }

    if (!supabase) {
      setErrorMessage(authUnavailableMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      const accountStatus = await checkAccountStatus(normalizedEmail);
      const existingAccountMessage = accountStatus
        ? getExistingAccountMessage(
            accountStatus,
            isSignUp ? "signup" : "password"
          )
        : null;

      if (isSignUp && accountStatus && !accountStatus.available) {
        setErrorMessage(
          accountStatus.error || t("auth.accountCheckUnavailable")
        );
        return;
      }

      if (existingAccountMessage) {
        setErrorMessage(existingAccountMessage);
        return;
      }

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${getBaseUrl()}/auth/callback?next=/settings`,
          },
        });

        if (error) throw error;

        if (data.session) {
          setMessage(t("auth.accountReady"));
          router.replace("/settings");
          router.refresh();
          return;
        }

        setMessage(t("auth.signUpCheckInbox"));
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      setMessage(t("auth.signedIn"));
      router.replace("/settings");
      router.refresh();
    } catch (error) {
      if (
        error instanceof Error &&
        /email not confirmed/i.test(error.message)
      ) {
        setErrorMessage(t("auth.emailNotConfirmed"));
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : t("auth.genericError")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setMessage(null);
    setErrorMessage(null);

    const normalizedEmail = normalizeEmail(email);

    if (!supabase) {
      setErrorMessage(authUnavailableMessage);
      return;
    }

    setIsGoogleSubmitting(true);

    try {
      const accountStatus = normalizedEmail
        ? await checkAccountStatus(normalizedEmail)
        : null;
      const existingAccountMessage = accountStatus
        ? getExistingAccountMessage(accountStatus, "google")
        : null;

      if (existingAccountMessage) {
        setErrorMessage(existingAccountMessage);
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${getBaseUrl()}/auth/callback?next=/settings`,
        },
      });

      if (error) throw error;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("auth.googleUnavailable")
      );
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat p-2 sm:p-3 lg:p-4"
      style={{
        backgroundColor: "#0E0E0E",
        backgroundImage:
          "linear-gradient(180deg,rgba(14,14,14,0.62)_0%,rgba(14,14,14,0.82)_100%), url('/LoginImage.png')",
      }}
    >
      <div className="relative mx-auto flex h-full w-full max-w-6xl items-center justify-center">
        <div className="relative z-10 grid h-full max-h-full w-full overflow-hidden rounded-xl border border-white/10 bg-black/35 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
          <section className="relative min-h-0 overflow-hidden border-r border-white/8 bg-white/[0.02] px-5 py-4 backdrop-blur-[36px] backdrop-saturate-[180%] sm:px-8 sm:py-5 lg:px-10 lg:py-6">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(12,12,14,0.2))]" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_42%,rgba(255,255,255,0.04)_100%)]" />
            <div
              className="absolute inset-[-18%] opacity-100"
              style={{
                backgroundImage: `radial-gradient(ellipse 110% 90% at ${
                  isRtl ? "100% 50%" : "0% 50%"
                }, rgba(150,255,245,0.48) 0%, rgba(78,214,255,0.38) 24%, rgba(37,99,235,0.26) 46%, rgba(14,14,14,0) 74%), radial-gradient(circle at ${
                  isRtl ? "78% 58%" : "22% 58%"
                }, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 34%)`,
              }}
            />
            <div className="relative z-10 mx-auto flex h-full w-full max-w-md flex-col justify-center">
              <div className="flex flex-1 flex-col justify-center">
                <p className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {isSignUp
                    ? t("auth.signUpTitle")
                    : isForgotPassword
                    ? t("auth.forgotPasswordTitle")
                    : isResetPassword
                    ? t("auth.resetPasswordTitle")
                    : t("auth.signInTitle")}
                </p>
                <p className="mt-3 text-center text-sm text-white/65">
                  {isSignUp
                    ? t("auth.signUpDescription")
                    : isForgotPassword
                    ? t("auth.forgotPasswordDescription")
                    : isResetPassword
                    ? t("auth.resetPasswordDescription")
                    : t("auth.signInDescription")}
                </p>

                <form className="mt-5 space-y-3.5" onSubmit={handleSubmit}>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t("auth.email")}
                    className="w-full rounded-xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white outline-none backdrop-blur-md transition placeholder:text-white/35 focus:border-white/25"
                  />

                  {!isForgotPassword ? (
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={
                          isResetPassword
                            ? t("auth.newPassword")
                            : t("auth.password")
                        }
                        className={`w-full rounded-xl border border-white/12 bg-white/8 py-3 text-sm text-white outline-none backdrop-blur-md transition placeholder:text-white/35 focus:border-white/25 ${
                          isRtl ? "pr-4 pl-12" : "px-4 pr-12"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className={`absolute inset-y-0 flex items-center text-white/60 transition hover:text-white ${passwordTogglePositionClass}`}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        <PasswordEyeGlyph visible={showPassword} />
                      </button>
                    </div>
                  ) : null}

                  {isSignUp || isResetPassword ? (
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder={
                          isResetPassword
                            ? t("auth.confirmNewPassword")
                            : t("auth.confirmPassword")
                        }
                        className={`w-full rounded-xl border border-white/12 bg-white/8 py-3 text-sm text-white outline-none backdrop-blur-md transition placeholder:text-white/35 focus:border-white/25 ${
                          isRtl ? "pr-4 pl-12" : "px-4 pr-12"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword((value) => !value)
                        }
                        className={`absolute inset-y-0 flex items-center text-white/60 transition hover:text-white ${passwordTogglePositionClass}`}
                        aria-label={
                          showConfirmPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        <PasswordEyeGlyph visible={showConfirmPassword} />
                      </button>
                    </div>
                  ) : !isForgotPassword ? (
                    <div className="text-center">
                      <Link
                        href="/forgot-password"
                        className="text-sm font-medium text-white/60 transition hover:text-white"
                      >
                        {t("auth.forgotPassword")}
                      </Link>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:scale-[1.01] hover:bg-white/95"
                  >
                    {isSubmitting
                      ? t("common.loading")
                      : isForgotPassword
                      ? t("auth.sendResetLink")
                      : isResetPassword
                      ? t("auth.updatePasswordAction")
                      : isSignUp
                      ? t("auth.createAccount")
                      : t("auth.signInAction")}
                  </button>

                  {!isForgotPassword && !isResetPassword ? (
                    <button
                      type="button"
                      disabled={isSubmitting || isGoogleSubmitting}
                      onClick={() => {
                        void handleGoogleAuth();
                      }}
                      className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:scale-[1.01] hover:bg-white/95"
                    >
                      <GoogleGlyph />
                      <span>
                        {isGoogleSubmitting
                          ? t("common.loading")
                          : isSignUp
                          ? t("auth.googleSignUp")
                          : t("auth.googleSignIn")}
                      </span>
                    </button>
                  ) : null}
                </form>

                <p className="mt-5 text-center text-sm text-white/58">
                  {isForgotPassword || isResetPassword
                    ? t("auth.backToSignInPrompt")
                    : isSignUp
                    ? t("auth.alreadyHaveAccount")
                    : t("auth.noAccount")}{" "}
                  <Link
                    href={
                      isForgotPassword || isResetPassword
                        ? "/signin"
                        : isSignUp
                        ? "/signin"
                        : "/signup"
                    }
                    className="font-semibold text-white underline decoration-white/25 underline-offset-4 transition hover:decoration-white/70"
                  >
                    {isForgotPassword || isResetPassword
                      ? t("auth.signInAction")
                      : isSignUp
                      ? t("auth.signInAction")
                      : t("auth.signUpAction")}
                  </Link>
                </p>

                {errorMessage ? (
                  <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-center text-sm text-red-100">
                    {errorMessage}
                  </div>
                ) : null}

                {message ? (
                  <div className="mt-4 rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-center text-sm text-white/78">
                    {message}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 text-center text-xs text-white/38">
                {t("auth.termsNote")}
              </div>
            </div>
          </section>

          <section
            className="relative hidden min-h-0 overflow-hidden border-s border-white/8 lg:block"
            style={{
              backgroundImage: "url('/LoginImage.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.28)_42%,rgba(0,0,0,0.66)_100%)]" />
            <div className="relative z-10 flex h-full flex-col p-4 sm:p-6 lg:p-7">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-white">
                  <Image
                    src="/StreamifyLogo.svg"
                    alt="Streamify"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                    priority
                  />
                  <span className="text-sm font-bold uppercase tracking-[0.2em]">
                    Streamify
                  </span>
                </div>
                <Link
                  href="/"
                  className="rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-black/45"
                >
                  Back
                </Link>
              </div>

              <div
                dir={isRtl ? "rtl" : "ltr"}
                className={`mt-auto flex flex-col ${
                  isRtl ? "items-end text-right" : "items-start text-left"
                }`}
              >
                <div className="max-w-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/48">
                    {t("auth.brandBadge")}
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    {heroTitle}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-white/72 sm:text-base">
                    {heroDescription}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
