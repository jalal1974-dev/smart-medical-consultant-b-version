import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Send an email through the Resend API (https://resend.com).
 * Returns `true` on success, `false` on any failure (callers treat email as
 * best-effort). Requires RESEND_API_KEY; EMAIL_FROM must be a verified sender
 * (Resend's onboarding@resend.dev works out of the box for testing).
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn(
      `[Email] RESEND_API_KEY not set — email to ${options.to} skipped ` +
        `(subject: ${options.subject})`
    );
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.emailFrom,
        to: [options.to],
        subject: options.subject,
        ...(options.html ? { html: options.html } : {}),
        ...(options.text ? { text: options.text } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Email] Send failed (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Email] Error calling Resend API:", error);
    return false;
  }
}

/**
 * Notify the site owner by email (OWNER_EMAIL). Replaces the Manus
 * owner-notification service. Returns `true` if the email was accepted,
 * `false` otherwise. Validation errors bubble up as TRPC errors.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.ownerEmail) {
    console.warn(
      `[Notification] OWNER_EMAIL not set — owner notification skipped (${title})`
    );
    return false;
  }

  return sendEmail({
    to: ENV.ownerEmail,
    subject: title,
    text: content,
  });
}
