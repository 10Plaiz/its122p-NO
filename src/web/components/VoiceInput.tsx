import { useEffect, useRef, useState } from "react";
import { Button } from "./ui.js";

// RS-1: dictate the report description instead of typing it. Progressive
// enhancement over the Web Speech API: where the browser has no speech recognition
// (Firefox, most in-app browsers) the control is not rendered at all, and the
// textarea beside it is the whole feature. Speech goes to the browser vendor's
// recognition service, never to KAMOTI.

// The slice of SpeechRecognition used here. Declared locally because the API is
// still prefixed in Chromium and Safari, and not every TypeScript DOM lib has it.
type RecognitionAlternative = { transcript: string };
type RecognitionResult = ArrayLike<RecognitionAlternative> & { isFinal: boolean };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

export function getSpeechRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speech = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

// Makati residents report in English, Filipino, or both in one sentence. en-PH
// copes with Taglish better than fil-PH does, so it is the default.
export const VOICE_LANGUAGES = [
  { value: "en-PH", label: "English (Philippines)" },
  { value: "fil-PH", label: "Filipino" },
] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]["value"];

// Adds one recognised phrase to what is already written, with a space between,
// cut at `max` so dictation can never push the field past its limit.
export function appendTranscript(current: string, spoken: string, max: number) {
  const phrase = spoken.trim();
  if (!phrase) return { text: current, truncated: false };

  const separator = current === "" || /\s$/.test(current) ? "" : " ";
  const combined = `${current}${separator}${phrase}`;
  if (combined.length <= max) return { text: combined, truncated: false };
  return { text: combined.slice(0, max), truncated: true };
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings, or type the description.",
  "service-not-allowed": "This browser does not allow dictation here. Type the description instead.",
  "no-speech": "No speech was heard. Choose Dictate and try again closer to the microphone.",
  "audio-capture": "No microphone was found. Type the description instead.",
  network: "Dictation needs an internet connection. Type the description instead.",
  "language-not-supported": "This browser cannot dictate in that language. Choose another language or type instead.",
};

export function VoiceInput({
  targetId,
  value,
  onChange,
  maxLength,
}: {
  /** The textarea the words go into, for aria-controls. */
  targetId: string;
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
}) {
  const [Recognition] = useState(getSpeechRecognition);
  const [language, setLanguage] = useState<VoiceLanguage>("en-PH");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");

  const recognitionRef = useRef<Recognition | null>(null);
  // Results arrive in callbacks created when dictation started; these keep them
  // appending to the current text rather than to the text as it was then.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Leaving the form stops the microphone.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  if (!Recognition) return null;

  const limitMessage = `The description is at its ${maxLength}-character limit. Shorten it to dictate more.`;

  function start() {
    if (!Recognition) return;
    if (valueRef.current.length >= maxLength) {
      setStatus(limitMessage);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = false;
    let failure = "";

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result?.isFinal || !result[0]) continue;

        const { text, truncated } = appendTranscript(valueRef.current, result[0].transcript, maxLength);
        valueRef.current = text;
        onChangeRef.current(text);
        if (truncated) {
          failure = limitMessage;
          recognition.stop();
          return;
        }
      }
    };
    recognition.onerror = (event) => {
      // "aborted" is our own stop on unmount, not something to report.
      if (event.error !== "aborted") {
        failure = ERROR_MESSAGES[event.error] ?? "Dictation stopped unexpectedly. Try again or type the description.";
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setStatus(failure || "Dictation stopped. Your words are in the description.");
    };

    try {
      recognition.start();
    } catch {
      setStatus("Dictation could not start. Try again or type the description.");
      return;
    }

    recognitionRef.current = recognition;
    setListening(true);
    setStatus("Listening. Speak now, then choose Dictate again to stop.");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        {/* A toggle keeps one name and reports its state through aria-pressed, so a
            screen reader says "Dictate, pressed" rather than a label that swaps. */}
        <Button
          type="button"
          variant={listening ? "primary" : "secondary"}
          aria-pressed={listening}
          aria-controls={targetId}
          onClick={() => (listening ? recognitionRef.current?.stop() : start())}
          className="inline-flex items-center gap-2"
        >
          <MicrophoneIcon />
          Dictate
          {listening && (
            <span aria-hidden="true" className="w-2 h-2 bg-current animate-pulse motion-reduce:animate-none" />
          )}
        </Button>

        <span className="inline-flex items-center gap-2">
          <label htmlFor={`${targetId}-voice-language`} className="font-mono text-[10px] uppercase tracking-wider text-muted">
            Language
          </label>
          <select
            id={`${targetId}-voice-language`}
            className="input w-auto py-1 text-[12px]"
            value={language}
            disabled={listening}
            onChange={(event) => setLanguage(event.target.value as VoiceLanguage)}
          >
            {VOICE_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      <span role="status" aria-live="polite" className="text-muted text-[11px] min-h-[1em]">
        {status}
      </span>
    </div>
  );
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
