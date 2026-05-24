import { useRef, useState } from "react";

interface RecognitionEvent {
  results: { [i: number]: { [i: number]: { transcript: string } } };
}

interface RecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechCtor = new () => RecognitionInstance;

function getSpeechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(onResult: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  const ref = useRef<RecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const supported = !!getSpeechCtor();

  function start() {
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e) => onResultRef.current(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    ref.current = r;
    setListening(true);
  }

  function stop() {
    ref.current?.stop();
    setListening(false);
  }

  function toggle() {
    if (listening) stop();
    else start();
  }

  return { listening, supported, toggle };
}
