/**
 * Script-based language detection for the intake conversation.
 *
 * The clinic is Arabic-first, but the consultation's stored `preferredLanguage`
 * is often just whatever the site happened to default to. If a patient then
 * types in Arabic, the reply is spoken with an English voice, which comes out
 * as unintelligible noise. Detecting the script the patient actually uses lets
 * us switch both the AI's language and the speech voice mid-conversation.
 */

export type DetectedLanguage = "en" | "ar";

// Arabic blocks: Arabic, Supplement, Extended-A, Presentation Forms A/B.
const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const LATIN_CHAR = /[A-Za-z]/g;

/**
 * Decide which language a patient message is written in.
 *
 * Returns `null` when there is no real signal (digits, punctuation, emoji, or
 * too few letters to be sure) so the caller can keep the current language
 * rather than flip-flopping on "ok", "123" or a lone emoji.
 */
export function detectLanguage(text: string): DetectedLanguage | null {
  if (!text) return null;

  const arabic = (text.match(ARABIC_CHAR) || []).length;
  const latin = (text.match(LATIN_CHAR) || []).length;
  const total = arabic + latin;

  // Not enough letters to judge — e.g. "5", ":)", "٧".
  if (total < 2) return null;

  // Arabic wins on any meaningful presence: Arabic speakers frequently mix in
  // Latin medical terms ("عندي CT scan"), and reading that whole sentence with
  // an English voice is far worse than reading it with an Arabic one.
  if (arabic >= 2 && arabic / total >= 0.25) return "ar";
  if (latin / total >= 0.75) return "en";

  return null;
}

/** Best-guess language for a first-time visitor, from their browser settings. */
export function detectBrowserLanguage(): DetectedLanguage {
  if (typeof navigator === "undefined") return "ar";
  const tags = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const tag of tags) {
    const lower = String(tag).toLowerCase();
    if (lower.startsWith("ar")) return "ar";
    if (lower.startsWith("en")) return "en";
  }
  // Clinic is Arabic-first (Jordan) — default to Arabic when the browser gives
  // no usable signal, rather than silently serving English.
  return "ar";
}

/**
 * Is a speech-synthesis voice for this language actually installed?
 *
 * Arabic voices ship with Android and iOS but are frequently absent on desktop
 * Windows. Without this check the browser reads Arabic text with an English
 * voice and the patient hears gibberish, with nothing explaining why.
 */
export function hasVoiceFor(lang: DetectedLanguage): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices();
  // No voices loaded yet — assume available; the caller re-checks on
  // `voiceschanged` rather than showing a false warning on first paint.
  if (!voices || voices.length === 0) return true;
  return voices.some((v) => (v.lang || "").toLowerCase().startsWith(lang));
}

/** Pick the best installed voice for a language, or null to use the default. */
export function pickVoice(lang: DetectedLanguage): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  return voices.find((v) => (v.lang || "").toLowerCase().startsWith(lang)) ?? null;
}
