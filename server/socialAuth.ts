/**
 * Google and Facebook sign-in (OAuth 2.0 authorization-code flow).
 *
 * These are real browser redirects, so they are Express routes rather than tRPC
 * procedures:
 *
 *   GET /api/auth/google            → redirect to Google's consent screen
 *   GET /api/auth/google/callback   → exchange the code, start a session
 *   GET /api/auth/facebook          → same for Facebook
 *   GET /api/auth/facebook/callback
 *
 * Identity rules (deliberate — these decide who can access a medical account):
 *
 *  1. A provider account maps to `openId = "<provider>:<id>"`.
 *  2. If that is unknown but the provider gives us a VERIFIED email that already
 *     belongs to an account, we sign into that existing account. This is what
 *     lets a patient who registered with a password later use "Continue with
 *     Google" without ending up with two records.
 *  3. We never link on an unverified email. Otherwise anyone who could get a
 *     provider to assert an address they do not own would take over the
 *     matching medical account.
 *
 * The client secret never reaches the browser, and the `state` parameter is
 * echoed through a short-lived signed cookie to block CSRF on the callback.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import * as db from "./db";

type Provider = "google" | "facebook";

const STATE_COOKIE = "smc_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000; // a consent screen should not take longer

interface ProviderProfile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Extra params for the authorize redirect. */
  authorizeExtras?: Record<string, string>;
  fetchProfile: (accessToken: string, idToken?: string) => Promise<ProviderProfile>;
}

/** Decode a JWT payload without verifying — safe only for data we then re-check. */
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

function providerConfig(provider: Provider): ProviderConfig | null {
  if (provider === "google") {
    if (!ENV.googleClientId || !ENV.googleClientSecret) return null;
    return {
      clientId: ENV.googleClientId,
      clientSecret: ENV.googleClientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scope: "openid email profile",
      authorizeExtras: { access_type: "online", prompt: "select_account" },
      async fetchProfile(accessToken, idToken) {
        // Google returns an id_token issued over TLS from its own token
        // endpoint, so its claims are trustworthy here without re-verifying
        // the signature. Fall back to the userinfo endpoint if it is absent.
        const claims = idToken ? decodeJwtPayload(idToken) : null;
        if (claims && typeof claims.sub === "string") {
          return {
            id: claims.sub,
            email: typeof claims.email === "string" ? claims.email : null,
            emailVerified: claims.email_verified === true || claims.email_verified === "true",
            name: typeof claims.name === "string" ? claims.name : null,
          };
        }
        const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
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
      },
    };
  }

  if (!ENV.facebookAppId || !ENV.facebookAppSecret) return null;
  return {
    clientId: ENV.facebookAppId,
    clientSecret: ENV.facebookAppSecret,
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope: "email public_profile",
    async fetchProfile(accessToken) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`Facebook profile failed: ${res.status}`);
      const j = (await res.json()) as Record<string, unknown>;
      return {
        id: String(j.id ?? ""),
        // Facebook only returns an address it has confirmed, and omits it
        // entirely for phone-number accounts — hence the null branch below.
        email: typeof j.email === "string" ? j.email : null,
        emailVerified: typeof j.email === "string",
        name: typeof j.name === "string" ? j.name : null,
      };
    },
  };
}

function callbackUrl(provider: Provider): string {
  return `${ENV.appUrl.replace(/\/$/, "")}/api/auth/${provider}/callback`;
}

/** Which social buttons the login page should render. */
export function enabledSocialProviders(): Provider[] {
  return (["google", "facebook"] as Provider[]).filter((p) => providerConfig(p) !== null);
}

function fail(res: Response, reason: string) {
  // Never leak provider/config detail into the URL a patient can see.
  console.error("[socialAuth]", reason);
  res.redirect(302, "/login?error=social_auth_failed");
}

export function registerSocialAuthRoutes(app: Express) {
  app.get("/api/auth/:provider", (req: Request, res: Response) => {
    const provider = req.params.provider as Provider;
    const cfg = providerConfig(provider);
    if (!cfg) return fail(res, `${provider} sign-in is not configured`);

    // CSRF: random state echoed back by the provider and matched against a
    // short-lived httpOnly cookie.
    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(STATE_COOKIE, `${provider}:${state}`, {
      httpOnly: true,
      sameSite: "lax", // must survive the provider's cross-site redirect back
      secure: ENV.isProduction,
      maxAge: STATE_TTL_MS,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: callbackUrl(provider),
      response_type: "code",
      scope: cfg.scope,
      state,
      ...(cfg.authorizeExtras ?? {}),
    });
    res.redirect(302, `${cfg.authorizeUrl}?${params.toString()}`);
  });

  app.get("/api/auth/:provider/callback", async (req: Request, res: Response) => {
    const provider = req.params.provider as Provider;
    const cfg = providerConfig(provider);
    if (!cfg) return fail(res, `${provider} sign-in is not configured`);

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

    if (!cookieState || cookieState !== `${provider}:${state}`) {
      return fail(res, "state mismatch — possible CSRF, or the login took too long");
    }

    try {
      const tokenRes = await fetch(cfg.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: callbackUrl(provider),
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenRes.ok) {
        return fail(res, `${provider} token exchange failed: ${tokenRes.status} ${(await tokenRes.text()).slice(0, 200)}`);
      }
      const tokenJson = (await tokenRes.json()) as { access_token?: string; id_token?: string };
      if (!tokenJson.access_token) return fail(res, `${provider} returned no access_token`);

      const profile = await cfg.fetchProfile(tokenJson.access_token, tokenJson.id_token);
      if (!profile.id) return fail(res, `${provider} returned no account id`);

      const providerOpenId = `${provider}:${profile.id}`;

      // 1. Known provider account.
      // Only the identity fields are needed here, and the two lookups return
      // slightly different column sets, so narrow to what we actually use.
      let user: { openId: string; name: string | null; email: string | null } | undefined =
        await db.getUserByOpenId(providerOpenId);

      // 2. Otherwise attach to an existing account with the same VERIFIED email
      //    (e.g. they originally registered with a password). Signing in keeps
      //    that account's original openId, so their password login keeps working.
      if (!user && profile.email && profile.emailVerified) {
        user = await db.getUserByEmail(profile.email);
      }

      let openId: string;
      let displayName: string;

      if (user) {
        openId = user.openId;
        displayName = user.name || profile.name || "User";
        await db.upsertUser({
          openId,
          name: user.name || profile.name || undefined,
          email: user.email || profile.email || undefined,
          loginMethod: provider,
        });
      } else {
        // 3. Brand-new patient.
        openId = providerOpenId;
        displayName = profile.name || "User";
        await db.upsertUser({
          openId,
          name: profile.name || undefined,
          email: profile.email || undefined,
          loginMethod: provider,
        });
      }

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
      fail(res, `${provider} callback error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
