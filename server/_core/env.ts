/**
 * Environment variable access with startup validation.
 *
 * Independent deployment (no Manus): only JWT_SECRET is hard-required.
 * AI features need an OpenAI-compatible provider (LLM_API_URL + LLM_API_KEY,
 * e.g. OpenRouter); storage needs the STORAGE_* vars (see server/storage.ts);
 * email needs RESEND_API_KEY (see server/_core/notification.ts).
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    // In test environments some vars may be intentionally absent — warn only.
    if (process.env.NODE_ENV === "test") {
      console.warn(`[ENV] WARNING: required env var ${key} is not set (test mode)`);
      return "";
    }
    throw new Error(
      `[ENV] Missing required environment variable: ${key}. ` +
      `Set it in your .env file or deployment secrets before starting the server.`
    );
  }
  return value;
}

function optionalEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

/** First non-empty value among the given env keys, else fallback. */
function firstEnv(keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim() !== "") return value;
  }
  return fallback;
}

export const ENV = {
  // ── Critical: server will not start without this ────────────────────────────
  cookieSecret:   requireEnv("JWT_SECRET"),

  // ── AI provider (OpenAI-compatible). LLM_API_URL example values:
  //    https://openrouter.ai/api    (OpenRouter)
  //    https://api.openai.com       (OpenAI)
  //    https://api.groq.com/openai  (Groq)
  //    Legacy BUILT_IN_FORGE_* vars still work as fallbacks. ──────────────────
  forgeApiUrl:    firstEnv(["LLM_API_URL", "BUILT_IN_FORGE_API_URL"]),
  forgeApiKey:    firstEnv(["LLM_API_KEY", "BUILT_IN_FORGE_API_KEY"]),
  llmModel:       optionalEnv("LLM_MODEL", "google/gemini-2.5-flash"),

  // Transcription may need a different provider than chat (OpenRouter has no
  // audio API — use OpenAI or Groq here). Falls back to the LLM provider.
  transcriptionApiUrl: firstEnv(["TRANSCRIPTION_API_URL", "LLM_API_URL", "BUILT_IN_FORGE_API_URL"]),
  transcriptionApiKey: firstEnv(["TRANSCRIPTION_API_KEY", "LLM_API_KEY", "BUILT_IN_FORGE_API_KEY"]),
  transcriptionModel: optionalEnv("TRANSCRIPTION_MODEL", "whisper-1"),

  // ── Email (Resend) ──────────────────────────────────────────────────────────
  resendApiKey:   optionalEnv("RESEND_API_KEY"),
  emailFrom:      optionalEnv("EMAIL_FROM", "Smart Medical Consultant <onboarding@resend.dev>"),
  ownerEmail:     optionalEnv("OWNER_EMAIL"),

  // ── Optional ───────────────────────────────────────────────────────────────
  oAuthServerUrl: optionalEnv("OAUTH_SERVER_URL"),
  appId:          optionalEnv("VITE_APP_ID", "smc-independent"),
  // Canonical public site URL used in emails (password reset, report links).
  appUrl:         optionalEnv("APP_URL", "http://localhost:3000"),
  databaseUrl:    optionalEnv("DATABASE_URL"),
  ownerOpenId:    optionalEnv("OWNER_OPEN_ID"),
  isProduction:   process.env.NODE_ENV === "production",
};
