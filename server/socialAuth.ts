/**
 * "Sign in with Google" (OAuth 2.0 authorization-code flow).
 *
 * These are real browser redirects, so they are Express routes rather than tRPC
 * procedures:
 *
 *   GET /api/auth/google            → redirect to Google's consent screen
 *   GET /api/auth/google/callback   → exchange the code, start a session
 *
 * Identity rules (deliberate — these decide who can reach a medical record):
 *
 *  1. A Google account maps to `openId = "google:<sub>"`.
 *  2. If that is unknown but Google gives us a VERIFIED email that already
 *     belongs to an account, we sign into that existing account. This is what
 *     lets a patient who registered with a password later use "Continue with
 *     Google" without ending up with two records — and their password keeps
 *     working, because the account's original openId is untouched.
 *  3. We never link on an unverified email. Otherwise anyone who could get
 *     Google to assert an address they do not own would take over the matching
 *     medical account.
 *
 * The client secret never reaches the browser, and the `state` parameter is
 * echoed through a short-lived HttpOnly cookie to block CSRF on the callback.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import * as db from "./db";

const STATE_COOKIE = "smc_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000; // a consent screen should not take longer

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

interface GoogleProfile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret);
}

/** Which social sign-in buttons the login page should render. */
export function enabledSocialProviders(): string[] {
  return isGoogleSignInConfigured() ? ["google"] : [];
}

function callbackUrl(): string {
  return `${ENV.appUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

/** Decode a JWT payload without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function fetchGoogleProfile(accessToken: string, idToken?: string): Promise<GoogleProfile> {
  // The id_token comes straight from Google's token endpoint over TLS, so its
  // claims are trustworthy here without re-verifying the signature ourselves.
  const claims = idToken ? decodeJwtPayload(idToken) : null;
  if (claims && typeof claims.sub === "string") {
    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      name: typeof claims.name === "string" ? claims.name : null,
    };
  }

  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  return {
    id: String(j.sub ?? ""),
    email: typeof j.email === "string" ? j.email : null,
    emailVerified: j.email_verified === true,
    name: typeof j.name === "string" ? j.name : null,
  };
}

function fail(res: Response, reason: string) {
  // Log the detail for the operator; never leak config detail into a URL the
  // patient can see.
  console.error("[googleAuth]", reason);
  res.redirect(302, "/login?error=social_auth_failed");
}

export function registerSocialAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req: Request, res: Response) => {
    if (!isGoogleSignInConfigured()) return fail(res, "Google sign-in is not configured");

    // CSRF: random state echoed back by Google and matched against a
    // short-lived HttpOnly cookie.
    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax", // must survive Google's cross-site redirect back
      secure: ENV.isProduction,
      maxAge: STATE_TTL_MS,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    res.redirect(302, `${AUTHORIZE_URL}?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    if (!isGoogleSignInConfigured()) return fail(res, "Google sign-in is not configured");

    // The patient pressed "Cancel" on the consent screen.
    if (typeof req.query.error === "string") {
      return res.redirect(302, "/login?error=social_auth_cancelled");
    }

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    if (!code || !state) return fail(res, "callback missing code or state");

    const cookieState = (req.headers.cookie ?? "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${STATE_COOKIE}=`))
      ?.slice(STATE_COOKIE.length + 1);
    res.clearCookie(STATE_COOKIE, { path: "/" });

    if (!cookieState || cookieState !== state) {
      return fail(res, "state mismatch — possible CSRF, or the login took too long");
    }

    try {
      const tokenRes = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: callbackUrl(),
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenRes.ok) {
        return fail(res, `token exchange failed: ${tokenRes.status} ${(await tokenRes.text()).slice(0, 200)}`);
      }

      const tokenJson = (await tokenRes.json()) as { access_token?: string; id_token?: string };
      if (!tokenJson.access_token) return fail(res, "Google returned no access_token");

      const profile = await fetchGoogleProfile(tokenJson.access_token, tokenJson.id_token);
      if (!profile.id) return fail(res, "Google returned no account id");

      const googleOpenId = `google:${profile.id}`;

      // 1. Known Google account. Only identity fields are needed, and the two
      //    lookups return slightly different column sets.
      let user: { openId: string; name: string | null; email: string | null } | undefined =
        await db.getUserByOpenId(googleOpenId);

      // 2. Otherwise attach to an existing account with the same VERIFIED email.
      if (!user && profile.email && profile.emailVerified) {
        user = await db.getUserByEmail(profile.email);
      }

      // Defensive: if the existing-account lookup ever returns a row without a
      // usable openId, fall back to the Google identity rather than creating a
      // broken session. Signing in must never depend on one field mapping.
      const matchedOpenId = typeof user?.openId === "string" && user.openId.length > 0
        ? user.openId
        : null;
      if (user && !matchedOpenId) {
        console.error("[googleAuth] matched an account by email but it had no openId — falling back to the Google identity");
      }
      const openId = matchedOpenId ?? googleOpenId;
      const displayName = (user?.name || profile.name || "User") as string;

      await db.upsertUser({
        openId,
        name: user?.name || profile.name || undefined,
        email: user?.email || profile.email || undefined,
        loginMethod: "google",
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: displayName,
        expiresInMs: ONE_YEAR_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/dashboard");
    } catch (err) {
      fail(res, `callback error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
