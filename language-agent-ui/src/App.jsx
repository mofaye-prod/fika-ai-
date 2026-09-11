import { useEffect, useRef, useState, useCallback } from "react";
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

// Point these at your running bot.py server. Update once you deploy
// instead of running locally.
const SERVER_URL = "http://localhost:7860/api/offer";
const LANGUAGE_ENDPOINT = "http://localhost:7860/set-language";
const PERSONA_ENDPOINT = "http://localhost:7860/set-persona";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

// name shown per language + gender, matching PERSONA_CONFIG in bot.py
const PERSONA_NAMES = {
  en: { female: "Maya", male: "Theo" },
  fr: { female: "Margot", male: "Philippe" },
};

const STATUS_TEXT = {
  idle: "Ready to connect",
  connecting: "Connecting…",
  connected: "Connected",
  disconnecting: "Disconnecting…",
};

export default function App() {
  const clientRef = useRef(null);
  const audioRef = useRef(null);
  const [connectionState, setConnectionState] = useState("idle");
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [language, setLanguage] = useState("en");
  const [gender, setGender] = useState("female");
  const [error, setError] = useState(null);

  const getClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;

    const client = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      enableCam: false,
      callbacks: {
        onConnected: () => setConnectionState("connected"),
        onDisconnected: () => {
          setConnectionState("idle");
          setBotSpeaking(false);
          setUserSpeaking(false);
        },
        onTransportStateChanged: (state) => {
          if (state === "connecting" || state === "authenticating") {
            setConnectionState("connecting");
          } else if (state === "disconnecting") {
            setConnectionState("disconnecting");
          }
        },
        onBotStartedSpeaking: () => setBotSpeaking(true),
        onBotStoppedSpeaking: () => setBotSpeaking(false),
        onUserStartedSpeaking: () => setUserSpeaking(true),
        onUserStoppedSpeaking: () => setUserSpeaking(false),
        onTrackStarted: (track, participant) => {
          if (track.kind === "audio" && !participant?.local && audioRef.current) {
            audioRef.current.srcObject = new MediaStream([track]);
          }
        },
        onError: (err) => {
          console.error(err);
          setError(typeof err === "string" ? err : err?.message || "Something went wrong.");
          setConnectionState("idle");
        },
      },
    });

    clientRef.current = client;
    return client;
  }, []);

  const handleConnect = useCallback(async () => {
    setError(null);
    setConnectionState("connecting");

    try {
      await fetch(LANGUAGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      await fetch(PERSONA_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender }),
      });
    } catch (err) {
      console.error("Couldn't set language/persona, connecting with server default:", err);
    }

    const client = getClient();
    try {
      await client.connect({ connection_url: SERVER_URL });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Couldn't reach the bot server. Is it running?");
      setConnectionState("idle");
    }
  }, [getClient, language, gender]);

  const handleDisconnect = useCallback(async () => {
    setConnectionState("disconnecting");
    await clientRef.current?.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  const isConnected = connectionState === "connected";
  const isBusy = connectionState === "connecting" || connectionState === "disconnecting";

  const presenceClass = botSpeaking
    ? "presence speaking"
    : userSpeaking
      ? "presence listening"
      : "presence idle";

  const personaName = PERSONA_NAMES[language][gender];

  return (
    <div className="app">
      <audio ref={audioRef} autoPlay playsInline />

      <div className="brand">
        <span className="brand-mark">Ami</span>
        <span className="brand-dot" />
      </div>
      <p className="subhead">
        A conversation partner, not a course. Talk it out loud, with {personaName}.
      </p>

      <div className="toggle-stack">
        <div>
          <p className="field-label">Language</p>
          <div className="pill-row" role="group" aria-label="Choose a language">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={`pill ${language === l.code ? "active" : ""}`}
                onClick={() => setLanguage(l.code)}
                disabled={isConnected || isBusy}
                aria-pressed={language === l.code}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label">Friend</p>
          <div className="pill-row" role="group" aria-label="Choose a persona">
            <button
              className={`pill persona ${gender === "female" ? "active" : ""}`}
              onClick={() => setGender("female")}
              disabled={isConnected || isBusy}
              aria-pressed={gender === "female"}
            >
              {PERSONA_NAMES[language].female}
            </button>
            <button
              className={`pill persona ${gender === "male" ? "active" : ""}`}
              onClick={() => setGender("male")}
              disabled={isConnected || isBusy}
              aria-pressed={gender === "male"}
            >
              {PERSONA_NAMES[language].male}
            </button>
          </div>
        </div>
      </div>

      <div className="presence-wrap">
        <div className="presence-card">
          <div className={presenceClass}>
            {(botSpeaking || userSpeaking) && (
              <div className="bars" aria-hidden="true">
                <span className="bar" />
                <span className="bar" />
                <span className="bar" />
                <span className="bar" />
                <span className="bar" />
              </div>
            )}
          </div>
          <div className="status-chip">
            {botSpeaking ? "Speaking" : userSpeaking ? "Listening" : STATUS_TEXT[connectionState]}
          </div>
        </div>
      </div>

      {!isConnected ? (
        <button className="connect-btn connect" onClick={handleConnect} disabled={isBusy}>
          {connectionState === "connecting" ? "Connecting…" : "Connect"}
        </button>
      ) : (
        <button
          className="connect-btn disconnect"
          onClick={handleDisconnect}
          disabled={connectionState === "disconnecting"}
        >
          End conversation
        </button>
      )}

      {error && <div className="error-banner">{error}</div>}

      <p className="footnote">
        Talking to a bot server running locally at localhost:7860. Your language
        and friend choice are sent to the server the moment you hit Connect.
      </p>
    </div>
  );
}
