/**
 * useVoiceChat — Web Speech API hook for medical history collection.
 *
 * Features:
 *  - Speech-to-text (STT) via SpeechRecognition API (browser-native)
 *  - Text-to-speech (TTS) via SpeechSynthesis API (browser-native)
 *  - Auto language detection from first 3 patient inputs
 *  - Manual language override
 *  - Volume control (0–1)
 *  - Visual listening / speaking state
 *  - Language preference persisted in sessionStorage
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Browser API type declarations ───────────────────────────────────────────
interface SpeechRecognitionEventMap {
  audioend: Event;
  audiostart: Event;
  end: Event;
  error: SpeechRecognitionErrorEventCompat;
  nomatch: SpeechRecognitionEventCompat;
  result: SpeechRecognitionEventCompat;
  soundend: Event;
  soundstart: Event;
  speechend: Event;
  speechstart: Event;
  start: Event;
}

interface SpeechRecognitionErrorEventCompat extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionResultCompat {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeCompat;
  [index: number]: SpeechRecognitionAlternativeCompat;
}

interface SpeechRecognitionAlternativeCompat {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultListCompat {
  readonly length: number;
  item(index: number): SpeechRecognitionResultCompat;
  [index: number]: SpeechRecognitionResultCompat;
}

interface SpeechRecognitionEventCompat extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListCompat;
}

interface SpeechRecognitionCompat extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionCompat, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognitionCompat, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionCompat, ev: SpeechRecognitionEventCompat) => void) | null;
  onerror: ((this: SpeechRecognitionCompat, ev: SpeechRecognitionErrorEventCompat) => void) | null;
  onend: ((this: SpeechRecognitionCompat, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionCompat;
    webkitSpeechRecognition: new () => SpeechRecognitionCompat;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type VoiceLang = "en" | "ar";

export interface UseVoiceChatOptions {
  /** Initial language — will be overridden by auto-detection */
  initialLanguage?: VoiceLang;
  /** Called whenever STT produces a final transcript */
  onTranscript?: (text: string) => void;
  /** Called when language is auto-detected or manually changed */
  onLanguageChange?: (lang: VoiceLang) => void;
}

export interface UseVoiceChatReturn {
  // State
  isListening: boolean;
  isSpeaking: boolean;
  isSTTSupported: boolean;
  isTTSSupported: boolean;
  detectedLanguage: VoiceLang;
  volume: number;
  interimTranscript: string;

  // Actions
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, lang?: VoiceLang) => void;
  stopSpeaking: () => void;
  setVolume: (v: number) => void;
  setLanguage: (lang: VoiceLang) => void;
  detectLanguageFromText: (text: string) => VoiceLang;
}

// ─── Arabic detection heuristic ───────────────────────────────────────────────
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

function detectLang(text: string): VoiceLang {
  const arabicChars = (text.match(ARABIC_REGEX) || []).length;
  const ratio = arabicChars / Math.max(text.replace(/\s/g, "").length, 1);
  return ratio > 0.25 ? "ar" : "en";
}

// BCP-47 locale codes for SpeechRecognition / SpeechSynthesis
const LANG_LOCALE: Record<VoiceLang, string> = {
  en: "en-US",
  ar: "ar-SA",
};


// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useVoiceChat(options: UseVoiceChatOptions = {}): UseVoiceChatReturn {
  const { initialLanguage = "en", onTranscript, onLanguageChange } = options;

  // ── Detect browser support ─────────────────────────────────────────────────
  const isSTTSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isTTSSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // ── State ──────────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<VoiceLang>(() => {
    try {
      const saved = sessionStorage.getItem("voiceChat_lang");
      return (saved as VoiceLang) || initialLanguage;
    } catch {
      return initialLanguage;
    }
  });
  const [volume, setVolumeState] = useState(1);
  const [interimTranscript, setInterimTranscript] = useState("");

  // ── Refs ───────────────────────────────────────────────────────────────────
  const recognitionRef = useRef<SpeechRecognitionCompat | null>(null);
  // True while the patient wants to keep recording. Used to restart the browser
  // session, which ends on its own after roughly a minute or after a pause.
  const shouldListenRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const langRef = useRef<VoiceLang>(detectedLanguage);
  const volumeRef = useRef(1);
  // Accumulate sample texts for auto-detection (first 3 user inputs)
  const sampleTextsRef = useRef<string[]>([]);
  const langLockedRef = useRef(false); // once auto-detected, don't re-detect

  // Keep refs in sync
  useEffect(() => { langRef.current = detectedLanguage; }, [detectedLanguage]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // ── Internal: update language ──────────────────────────────────────────────
  const applyLanguage = useCallback((lang: VoiceLang, lock = false) => {
    setDetectedLanguage(lang);
    langRef.current = lang;
    if (lock) langLockedRef.current = true;
    try { sessionStorage.setItem("voiceChat_lang", lang); } catch { /* ignore */ }
    onLanguageChange?.(lang);
  }, [onLanguageChange]);

  // ── Auto-detect from text ──────────────────────────────────────────────────
  const detectLanguageFromText = useCallback((text: string): VoiceLang => {
    if (!text.trim()) return langRef.current;
    if (!langLockedRef.current) {
      sampleTextsRef.current.push(text);
      if (sampleTextsRef.current.length >= 2) {
        const combined = sampleTextsRef.current.join(" ");
        const detected = detectLang(combined);
        if (detected !== langRef.current) {
          applyLanguage(detected, true);
        } else {
          langLockedRef.current = true;
        }
      }
    }
    return langRef.current;
  }, [applyLanguage]);

  // ── STT: start listening ───────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSTTSupported || isListening) return;

    const SpeechRecognitionCtor: new () => SpeechRecognitionCompat =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();

    recognition.lang = LANG_LOCALE[langRef.current];
    // Continuous, because a patient describing a symptom pauses to think. With
    // continuous=false the browser ends the turn at the first pause and the
    // half-finished sentence is sent as their answer.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Voice-note model: the microphone stays open until the patient stops it.
    // Nothing is ever submitted automatically — each finished phrase is handed
    // to the caller, which appends it to the message box so the patient can
    // read it, correct it, and press Send when they are ready. Silence-based
    // auto-send was cutting people off mid-sentence while they recalled dates
    // and medicine names.
    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEventCompat) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalText = transcript.trim();
          if (finalText) {
            detectLanguageFromText(finalText);
            onTranscript?.(finalText);
          }
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventCompat) => {
      // "no-speech" just means they have not started yet; "aborted" is our own
      // stop(). Neither should end the recording the patient asked for.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[STT] error:", event.error);
        shouldListenRef.current = false;
        setIsListening(false);
      }
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setInterimTranscript("");
      // Chrome ends a recognition session on its own every minute or so, and
      // after any pause. While the patient still has recording switched on,
      // restart it so their microphone genuinely stays open.
      if (shouldListenRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          /* fall through to stopping if the browser refuses to restart */
        }
      }
      setIsListening(false);
    };

    shouldListenRef.current = true;
    recognitionRef.current = recognition;
    recognition.start();
  }, [isSTTSupported, isListening, detectLanguageFromText, onTranscript]);

  // ── STT: stop listening ────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    // Clear the flag first, so the auto-restart in `onend` does not reopen the
    // microphone we are deliberately closing.
    shouldListenRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* not running */ }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  // ── TTS: speak text ────────────────────────────────────────────────────────
  const speak = useCallback((text: string, lang?: VoiceLang) => {
    if (!isTTSSupported || !text.trim()) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_LOCALE[lang || langRef.current];
    utterance.volume = volumeRef.current;
    utterance.rate = 0.95;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isTTSSupported]);

  // ── TTS: stop speaking ─────────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (isTTSSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isTTSSupported]);

  // ── Volume control ─────────────────────────────────────────────────────────
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    volumeRef.current = clamped;
    // Update currently speaking utterance if any
    if (utteranceRef.current) {
      utteranceRef.current.volume = clamped;
    }
  }, []);

  // ── Manual language override ───────────────────────────────────────────────
  const setLanguage = useCallback((lang: VoiceLang) => {
    applyLanguage(lang, true);
    sampleTextsRef.current = []; // reset auto-detection samples
  }, [applyLanguage]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (isTTSSupported) window.speechSynthesis.cancel();
    };
  }, [isTTSSupported]);

  return {
    isListening,
    isSpeaking,
    isSTTSupported,
    isTTSSupported,
    detectedLanguage,
    volume,
    interimTranscript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    setVolume,
    setLanguage,
    detectLanguageFromText,
  };
}
