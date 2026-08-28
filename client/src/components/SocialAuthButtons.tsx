/**
 * "Continue with Google / Facebook" buttons for the login and register pages.
 *
 * These are plain links, not fetch calls: OAuth needs a full browser navigation
 * so the provider can show its own consent screen and redirect back.
 *
 * Buttons render only for providers the server actually has keys for, so a
 * half-configured provider never shows a button that dead-ends.
 */

import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";

function GoogleMark() {
  // Google requires their official four-colour mark on sign-in buttons.
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5h-1.9V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

export default function SocialAuthButtons({ mode }: { mode: "login" | "register" }) {
  const { language } = useLanguage();
  const { data } = trpc.auth.socialProviders.useQuery(undefined, { staleTime: 10 * 60 * 1000 });
  const providers = data?.providers ?? [];

  if (providers.length === 0) return null;

  const isAr = language === "ar";
  const verb = mode === "register"
    ? (isAr ? "سجّل عبر" : "Sign up with")
    : (isAr ? "تابع عبر" : "Continue with");

  return (
    <div className="space-y-3" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-600/50" />
        <span className="text-xs text-slate-400">{isAr ? "أو" : "or"}</span>
        <span className="h-px flex-1 bg-slate-600/50" />
      </div>

      <div className="space-y-2">
        {providers.includes("google") && (
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-2.5 w-full rounded-md border border-slate-600 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <GoogleMark />
            {verb} Google
          </a>
        )}
        {providers.includes("facebook") && (
          <a
            href="/api/auth/facebook"
            className="flex items-center justify-center gap-2.5 w-full rounded-md border border-slate-600 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <FacebookMark />
            {verb} Facebook
          </a>
        )}
      </div>
    </div>
  );
}
