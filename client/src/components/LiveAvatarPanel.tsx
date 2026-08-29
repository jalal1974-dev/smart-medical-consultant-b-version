/**
 * LiveAvatarPanel — interactive video avatar for the clinical intake session.
 *
 * Design: LiveAvatar (HeyGen) provides ONLY the face and the voice. The clinical
 * brain stays in our own `avatarSession.chat` tRPC procedure, so the differential
 * -diagnosis prompting, the saved transcript and the "never reveal a diagnosis"
 * rules are unchanged. The parent page calls `speak()` on this component's
 * handle with each LLM reply, and the avatar says it.
 *
 * Degradation ladder (the page must never break):
 *   1. LiveAvatar configured + session starts  → live video avatar
 *   2. Not configured / vendor error / no key  → static avatar + browser speech
 * The parent is told which mode is active via `onModeChange` so it does not
 * double-speak the reply through the Web Speech API.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Stethoscope,
  Loader2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  AlertTriangle,
} from "lucide-react";

export type AvatarMode = "idle" | "connecting" | "live" | "fallback";

/**
 * The clinic's own doctor artwork, shown during voice-only intake.
 * Served from `client/public/`. WebP at 768px — 68 KB instead of the 1.8 MB
 * source PNG, which matters because patients often open this on mobile data.
 * If the file is ever absent the panel degrades to the stethoscope mark rather
 * than showing a broken image.
 */
const DOCTOR_IMAGE_SRC = "/doctor-avatar.webp";

export interface LiveAvatarHandle {
  /** Make the avatar say this text. No-op unless a live session is running. */
  speak: (text: string) => void;
  /** Stop the avatar mid-sentence (e.g. the patient started typing). */
  interrupt: () => void;
  /** True when a live video session is streaming. */
  isLive: () => boolean;
}

interface Props {
  consultationId: number | null;
  language: "en" | "ar";
  /** Told "live" once video is streaming, "fallback" when using speech synthesis. */
  onModeChange?: (mode: AvatarMode) => void;
  /** Fired when the avatar starts/stops speaking, for UI state. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Fired with transcribed patient speech when the mic is on. */
  onUserSpeech?: (text: string) => void;
  /** True once the interview has begun — changes the idle caption. */
  conversationStarted?: boolean;
}

const T = {
  en: {
    title: "AI Clinical Intake Doctor",
    idle: "Start the video doctor for a face-to-face intake",
    connecting: "Connecting to the video doctor…",
    live: "Live",
    speaking: "Speaking…",
    ready: "Listening",
    fallbackNote: "Voice-only mode — the video avatar is not configured",
    start: "Start video doctor",
    stop: "End video",
    micOn: "Mute microphone",
    micOff: "Speak to the doctor",
    failed: "Could not start the video avatar. Continuing in voice-only mode.",
  },
  ar: {
    title: "الطبيب المساعد الذكي",
    idle: "ابدأ الطبيب المرئي لإجراء مقابلة وجهاً لوجه",
    connecting: "جارٍ الاتصال بالطبيب المرئي…",
    live: "مباشر",
    speaking: "يتحدث…",
    ready: "يستمع",
    fallbackNote: "وضع الصوت فقط — الأفاتار المرئي غير مُفعّل",
    start: "ابدأ الطبيب المرئي",
    stop: "إنهاء الفيديو",
    micOn: "كتم المايكروفون",
    micOff: "تحدث إلى الطبيب",
    failed: "تعذّر تشغيل الأفاتار المرئي. سنكمل بوضع الصوت فقط.",
  },
} as const;

const LiveAvatarPanel = forwardRef<LiveAvatarHandle, Props>(function LiveAvatarPanel(
  { consultationId, language, onModeChange, onSpeakingChange, onUserSpeech, conversationStarted },
  ref,
) {
  const [mode, setMode] = useState<AvatarMode>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const messagesStarted = Boolean(conversationStarted);

  // Only offer the paid video avatar when the server actually has it configured,
  // so a voice-only clinic never shows a button that cannot work.
  const { data: videoCfg } = trpc.avatarSession.videoAvailable.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const videoAvailable = videoCfg?.available === true;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Holds the LiveAvatarSession instance. `any` because the SDK is loaded
  // lazily — importing its types eagerly would pull the chunk into the bundle.
  const sessionRef = useRef<any>(null);
  const mountedRef = useRef(true);

  const t = T[language];

  const tokenMutation = trpc.avatarSession.getStreamingToken.useMutation();

  const applyMode = useCallback(
    (next: AvatarMode) => {
      setMode(next);
      onModeChange?.(next);
    },
    [onModeChange],
  );

  const applySpeaking = useCallback(
    (next: boolean) => {
      setIsSpeaking(next);
      onSpeakingChange?.(next);
    },
    [onSpeakingChange],
  );

  // ── Teardown ───────────────────────────────────────────────────────────────
  const stopSession = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      try {
        await session.stop();
      } catch {
        /* the vendor socket may already be gone — nothing to recover */
      }
    }
    if (mountedRef.current) {
      applySpeaking(false);
      setMicOn(false);
      applyMode("fallback");
    }
  }, [applyMode, applySpeaking]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Fire-and-forget: never leave a paid streaming session running.
      const session = sessionRef.current;
      sessionRef.current = null;
      session?.stop?.().catch?.(() => {});
    };
  }, []);

  // ── Start a live session ───────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (!consultationId || sessionRef.current) return;
    applyMode("connecting");
    setErrorNote(null);

    try {
      const res = await tokenMutation.mutateAsync({ consultationId, language });

      if (!res.configured || !res.sessionToken) {
        // Not an error the patient should see — the clinic simply has no key, or
        // the vendor rejected the config. Log the reason so the operator can
        // diagnose it from the browser console instead of guessing why the
        // video silently downgraded to voice-only.
        if (res.reason) console.warn("[LiveAvatar] video unavailable —", res.reason);
        if (mountedRef.current) applyMode("fallback");
        return;
      }

      // Lazy-load so livekit-client lands in its own chunk and never weighs on
      // the main site bundle.
      const { LiveAvatarSession, SessionEvent, AgentEventsEnum } = await import(
        "@heygen/liveavatar-web-sdk"
      );

      if (!mountedRef.current) return;

      const session = new LiveAvatarSession(res.sessionToken, { voiceChat: false });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (!mountedRef.current) return;
        if (videoRef.current) session.attach(videoRef.current);
        applyMode("live");
      });

      session.on(SessionEvent.SESSION_DISCONNECTED, () => {
        if (!mountedRef.current) return;
        sessionRef.current = null;
        applySpeaking(false);
        setMicOn(false);
        applyMode("fallback");
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        if (mountedRef.current) applySpeaking(true);
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        if (mountedRef.current) applySpeaking(false);
      });

      // Patient speech → hand the text up so the page sends it to our LLM.
      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (event: { text: string }) => {
        const text = (event?.text ?? "").trim();
        if (text && mountedRef.current) onUserSpeech?.(text);
      });

      await session.start();

      // Some SDK builds emit STREAM_READY before we subscribe; attach defensively.
      if (mountedRef.current && videoRef.current) {
        try {
          session.attach(videoRef.current);
        } catch {
          /* already attached */
        }
      }
    } catch (err) {
      console.error("[LiveAvatar] failed to start session:", err);
      sessionRef.current = null;
      if (mountedRef.current) {
        setErrorNote(t.failed);
        applyMode("fallback");
      }
    }
  }, [consultationId, language, tokenMutation, applyMode, applySpeaking, onUserSpeech, t.failed]);

  // ── Microphone (patient speaks to the avatar) ──────────────────────────────
  const toggleMic = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      if (micOn) {
        session.stopListening?.();
        session.voiceChat?.stop?.();
        setMicOn(false);
      } else {
        await session.voiceChat?.start?.({ defaultMuted: false });
        session.startListening?.();
        setMicOn(true);
      }
    } catch (err) {
      console.error("[LiveAvatar] microphone toggle failed:", err);
      setMicOn(false);
    }
  }, [micOn]);

  // ── Imperative handle for the parent page ──────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      speak: (text: string) => {
        const session = sessionRef.current;
        if (!session || !text.trim()) return;
        try {
          // `repeat` = say exactly this text (LITE mode: we own the brain).
          session.repeat(text);
        } catch (err) {
          console.error("[LiveAvatar] speak failed:", err);
        }
      },
      interrupt: () => {
        try {
          sessionRef.current?.interrupt?.();
        } catch {
          /* nothing streaming */
        }
      },
      isLive: () => mode === "live" && Boolean(sessionRef.current),
    }),
    [mode],
  );

  const isRtl = language === "ar";
  const showVideo = mode === "live" || mode === "connecting";

  return (
    <div className="flex flex-col gap-2" dir={isRtl ? "rtl" : "ltr"}>
      {/* 16:9 while a video stream is playing, square otherwise: the clinic's
          artwork is a square image, and cropping it to 16:9 pushed the doctor
          to the edge and hid him behind the caption bar. */}
      <div
        className={`relative w-full ${showVideo ? "aspect-video" : "aspect-square"} bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl overflow-hidden border border-border`}
      >
        {/* Live video surface — kept mounted so `attach` always has a target */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${showVideo ? "" : "hidden"}`}
        />

        {/* Voice-only mode: the clinic's own doctor artwork.
            Falls back to the stethoscope mark if the image is missing, so the
            page never shows a broken image. */}
        {!showVideo && (
          <div className="absolute inset-0">
            {!imageFailed ? (
              <img
                src={DOCTOR_IMAGE_SRC}
                alt={t.title}
                onError={() => setImageFailed(true)}
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isSpeaking ? "scale-[1.03]" : "scale-100"
                }`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className={`relative w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center transition-all duration-300 ${
                    isSpeaking ? "ring-4 ring-primary ring-offset-2 scale-105" : ""
                  }`}
                >
                  <Stethoscope className="w-14 h-14 text-primary" />
                </div>
              </div>
            )}

            {/* Caption bar: who is talking + animated speaking bars */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/45 to-transparent px-3 pt-8 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white drop-shadow">{t.title}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {isSpeaking ? (
                    <>
                      <span className="flex items-end gap-[2px] h-3" aria-hidden="true">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className="w-[3px] bg-white/90 rounded-full"
                            style={{
                              height: "100%",
                              animation: `avatarBar 900ms ease-in-out ${i * 120}ms infinite`,
                            }}
                          />
                        ))}
                      </span>
                      <span className="text-[10px] text-white/90">{t.speaking}</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] text-white/90">
                        {messagesStarted ? t.ready : t.idle}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>

            <style>{`
              @keyframes avatarBar {
                0%, 100% { transform: scaleY(0.35); }
                50%      { transform: scaleY(1); }
              }
            `}</style>
          </div>
        )}

        {/* Connecting veil */}
        {mode === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">{t.connecting}</p>
          </div>
        )}

        {/* Live badge */}
        {mode === "live" && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-background/85 backdrop-blur-sm rounded-full px-2.5 py-1 border border-border">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-foreground">
              {isSpeaking ? t.speaking : t.live}
            </span>
          </div>
        )}
      </div>

      {/* Controls — hidden entirely when the clinic runs voice-only */}
      <div className={`items-center gap-2 ${videoAvailable ? "flex" : "hidden"}`}>
        {mode === "live" ? (
          <>
            <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={stopSession}>
              <VideoOff className="w-4 h-4" />
              {t.stop}
            </Button>
            <Button
              variant={micOn ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={toggleMic}
              title={micOn ? t.micOn : t.micOff}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 w-full"
            onClick={startSession}
            disabled={mode === "connecting" || !consultationId}
          >
            {mode === "connecting" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Video className="w-4 h-4" />
            )}
            {t.start}
          </Button>
        )}
      </div>

      {errorNote && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {errorNote}
        </p>
      )}
    </div>
  );
});

export default LiveAvatarPanel;
