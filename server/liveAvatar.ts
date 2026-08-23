/**
 * LiveAvatar (HeyGen) — server-side session token minting.
 *
 * The LiveAvatar API key must NEVER reach the browser. The browser SDK
 * (@heygen/liveavatar-web-sdk) authenticates with a short-lived *session token*
 * that we mint here, per patient, per consultation.
 *
 * We run the avatar in LITE mode on purpose: LiveAvatar supplies only the face
 * and the voice. The clinical brain stays in our own tRPC `avatarSession.chat`
 * procedure, which keeps the differential-diagnosis system prompt, the saved
 * transcript, the ownership checks and the "never reveal a diagnosis" rules
 * under our control. The client simply tells the avatar to speak each reply.
 *
 * Docs: https://docs.liveavatar.com/api-reference/sessions/create-session-token
 */

import { ENV } from "./_core/env";

export interface LiveAvatarTokenResult {
  sessionToken: string;
  sessionId: string | null;
}

/** True when the deployment has enough config to run a real video avatar. */
export function isLiveAvatarConfigured(): boolean {
  return Boolean(ENV.liveAvatarApiKey && ENV.liveAvatarId);
}

/**
 * Mint a LiveAvatar session token.
 *
 * @param language  Interview language — drives the avatar's speech synthesis.
 * @throws Error when LiveAvatar is not configured or the API rejects the request.
 */
export async function createLiveAvatarSessionToken(
  language: "en" | "ar" = "en",
): Promise<LiveAvatarTokenResult> {
  if (!isLiveAvatarConfigured()) {
    throw new Error("LiveAvatar is not configured on this server");
  }

  // avatar_persona carries the voice + language for the synthesised speech.
  // voice_id is optional — omitting it uses the avatar's default voice.
  const avatarPersona: Record<string, unknown> = { language };
  if (ENV.liveAvatarVoiceId) avatarPersona.voice_id = ENV.liveAvatarVoiceId;

  const body: Record<string, unknown> = {
    mode: "LITE",
    avatar_id: ENV.liveAvatarId,
    is_sandbox: ENV.liveAvatarSandbox,
    avatar_persona: avatarPersona,
  };

  let res: Response;
  try {
    res = await fetch(`${ENV.liveAvatarApiUrl}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": ENV.liveAvatarApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      // Never let a hung upstream stall the intake page.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(
      `LiveAvatar token request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const rawText = await res.text();
  if (!res.ok) {
    // Surface the upstream message but never echo our API key back.
    throw new Error(`LiveAvatar API error ${res.status}: ${rawText.slice(0, 400)}`);
  }

  let parsed: { data?: { session_token?: string; session_id?: string } };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("LiveAvatar API returned a non-JSON response");
  }

  const sessionToken = parsed?.data?.session_token;
  if (!sessionToken) {
    throw new Error("LiveAvatar API response did not contain a session_token");
  }

  return { sessionToken, sessionId: parsed.data?.session_id ?? null };
}
