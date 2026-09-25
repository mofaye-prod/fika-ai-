import { useEffect, useRef, useState, useCallback } from "react";
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import "./fika.css";

// Point these at your running bot.py server. Update once you deploy
// instead of running locally.
const SERVER_URL = "http://localhost:7860/api/offer";
const LANGUAGE_ENDPOINT = "http://localhost:7860/set-language";
const PERSONA_ENDPOINT = "http://localhost:7860/set-persona";
const MODE_ENDPOINT = "http://localhost:7860/set-mode";
const SETTINGS_ENDPOINT = "http://localhost:7860/session-settings";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

const MODES = [
  { id: "friend", label: "Friend" },
  { id: "teacher", label: "Teacher" },
];

// name shown per language + gender, matching PERSONA_CONFIG in bot.py
const PERSONA_NAMES = {
  en: { female: "Maya", male: "Theo" },
  fr: { female: "Margot", male: "Philippe" },
};

// one line of character, shown under the name before a session starts
const PERSONA_BLURBS = {
  Margot: "Lyon. Talks fast, will ask about your weekend.",
  Philippe: "Marseille. Dry sense of humor, opinions about football.",
  Maya: "Chicago. Curious, will follow a tangent anywhere.",
  Theo: "Manchester. Easy-going, talks about music and food.",
};

const STATUS_TEXT = {
  idle: "Ready when you are",
  connecting: "Connecting…",
  connected: "Connected",
  disconnecting: "Ending…",
};

/** ?demo=board fills the panels with sample content. */
function isDemo() {
  return new URLSearchParams(window.location.search).get("demo") === "board";
}

/** Greeting line in the header: "Tuesday evening". */
function whenItIs() {
  const now = new Date();
  const day = now.toLocaleDateString(undefined, { weekday: "long" });
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  return `${day} ${part}`;
}

/**
 * The speaker mark: a small framed line portrait, one per voice.
 * Drawn at 28x34 and scaled by the `size` prop.
 */
function SpeakerMark({ name, size = 32, className = "" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 0.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const shoulders = "M6 33c0-4.8 3.4-7.6 8-7.6s8 2.8 8 7.6";
  const head =
    "M9.4 15.6c0-4.2 2-6.8 4.6-6.8s4.6 2.6 4.6 6.8c0 4.6-2 7.6-4.6 7.6s-4.6-3-4.6-7.6z";
  const eyes = "M11.4 15.4h1.2M15.4 15.4h1.2";

  const hair = {
    Margot:
      "M8.8 15c-.8-6 2.2-9.6 5.2-9.6s6 3.6 5.2 9.6c-1-2.8-1.6-4-2.4-4.6-1.6.8-4 .8-5.6 0-.8.6-1.4 1.8-2.4 4.6z",
    Philippe:
      "M8.8 12.2c.7-4 3-6.2 5.2-6.2s4.5 2.2 5.2 6.2c-1.4-1.6-3.1-2.4-5.2-2.4-1.3 1-3.2 1.8-5.2 2.4z",
    Maya: "M8.6 15c-.6-3.6.6-6.4 2.2-7.6 1 .8 2.2 1.2 3.2 1.2s2.2-.4 3.2-1.2c1.6 1.2 2.8 4 2.2 7.6-.7-2.6-1.2-3.8-2-4.4-1.6.9-5.2.9-6.8 0-.8.6-1.3 1.8-2 4.4z",
    Theo: "M9.2 11.4c.9-3 2.6-4.6 4.8-4.6s3.9 1.6 4.8 4.6c-1.5-1-3-1.4-4.8-1.4s-3.3.4-4.8 1.4z",
  }[name];

  return (
    <svg
      className={`mark ${className}`}
      width={size}
      height={(size * 34) / 28}
      viewBox="0 0 28 34"
      role="img"
      aria-label={name}
    >
      <rect
        x="0.6"
        y="0.6"
        width="26.8"
        height="32.8"
        className="mark-frame"
        stroke="currentColor"
        strokeWidth="0.9"
      />
      {name === "Maya" && <circle cx="14" cy="4.6" r="2" fill="currentColor" />}
      <path d={hair} fill="currentColor" />
      <g {...common}>
        <path d={shoulders} />
        <path d={head} />
      </g>
      <g className="eyes" {...common}>
        <path d={eyes} />
      </g>
      <g {...common}>
        {name === "Philippe" ? (
          <>
            <path d="M12.4 19.4h3.2" />
            <path d="M9.8 20.2c.9 3.2 7.5 3.2 8.4 0" />
          </>
        ) : name === "Maya" ? (
          <path d="M11.8 19.2c1.4 1.5 3 1.5 4.4 0" />
        ) : (
          <path d="M12.2 19.4c1.2.9 2.4.9 3.6 0" />
        )}
      </g>
      {name === "Margot" && <circle cx="18.9" cy="17.6" r="0.85" fill="currentColor" />}
      {name === "Theo" && (
        <g fill="currentColor">
          <circle cx="10.6" cy="17.8" r="0.5" />
          <circle cx="11.7" cy="18.8" r="0.5" />
          <circle cx="17.4" cy="17.8" r="0.5" />
          <circle cx="16.3" cy="18.8" r="0.5" />
        </g>
      )}
    </svg>
  );
}


/* ---------------------------------------------------------------
 * The session board.
 *
 * Entries arrive from the teacher as she writes, before she speaks
 * about them. Four kinds cover what a language tutor actually puts
 * on a board:
 *
 *   { kind: "phrase",     text, gloss }
 *   { kind: "correction", wrong, right, aside }
 *   { kind: "table",      title, rows: [[left, right], ...] }
 *   { kind: "list",       title, items: [..] }
 *
 * `aside` and `gloss` render as Margot's handwriting.
 * ------------------------------------------------------------- */

const DEMO_BOARD = [
  { id: 1, kind: "phrase", text: "aller au marché", gloss: "to go to the market" },
  {
    id: 2,
    kind: "correction",
    wrong: "J'ai allé au marché",
    right: "Je suis allé au marché",
    aside: "aller → toujours être",
  },
  {
    id: 3,
    kind: "table",
    title: "Aller — passé composé",
    rows: [
      ["je", "suis allé(e)"],
      ["tu", "es allé(e)"],
      ["il / elle", "est allé / allée"],
      ["nous", "sommes allé(e)s"],
    ],
  },
  {
    id: 4,
    kind: "list",
    title: "Others that take être",
    items: ["venir", "partir", "rester", "arriver", "entrer", "monter"],
  },
];

/** A single thing written on the board. */
function BoardEntry({ entry, isLatest, index }) {
  // a fraction of a degree, alternating, so entries read as written
  const tilt = (index % 2 === 0 ? -1 : 1) * (0.15 + (index % 3) * 0.05);

  return (
    <div
      className={`entry ${isLatest ? "latest" : ""}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {isLatest && (
        <div className="entry-flag">
          <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
            <path
              d="M1 6h21M17 2l5 4-5 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="micro">Just now</span>
        </div>
      )}

      {entry.kind === "phrase" && (
        <>
          <div className="micro">Phrase</div>
          <div className="entry-line">{entry.text}</div>
          {entry.gloss && <div className="hand">{entry.gloss}</div>}
        </>
      )}

      {entry.kind === "correction" && (
        <>
          <div className="micro">Your sentence</div>
          <div className="wrong-row">
            <span className="struck">{entry.wrong}</span>
          </div>
          <div className="entry-line circled">
            <span className="circled-text">
              {entry.right}
              <svg
                className="circle"
                viewBox="0 0 100 40"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M4 20C4 9 24 3 50 3s46 6 46 17-19 17-46 17S4 31 4 20z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </span>
          </div>
          {entry.aside && <div className="hand">{entry.aside}</div>}
        </>
      )}

      {entry.kind === "table" && (
        <>
          <div className="micro">{entry.title}</div>
          <div className="entry-table">
            {entry.rows.map(([left, right], i) => (
              <div className="table-row" key={i}>
                <span className="table-key">{left}</span>
                <span>{right}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {entry.kind === "list" && (
        <>
          <div className="micro">{entry.title}</div>
          <div className="entry-list">{entry.items.join(" · ")}</div>
        </>
      )}
    </div>
  );
}

/** The ruled page the entries live on. */
function Board({ entries, subject }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length]);

  return (
    <div className="board">
      <div className="board-head">
        <div className="board-head-left">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 11.5l7-7 2.5 2.5-7 7-3 .5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          <span className="micro">Board</span>
        </div>
        {subject && <span className="hand board-subject">{subject}</span>}
      </div>

      <div className="board-page">
        <div className="board-margin" />
        {entries.length === 0 ? (
          <div className="board-empty hand">
            Anything worth keeping will land here.
          </div>
        ) : (
          entries.map((entry, i) => (
            <BoardEntry
              key={entry.id ?? i}
              entry={entry}
              index={i}
              isLatest={i === entries.length - 1}
            />
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}


/* ---------------------------------------------------------------
 * Friend mode: things she mentioned.
 *
 * Same delivery as the board, deliberately quieter — no highlight,
 * no auto-scroll, nothing asking to be read mid-conversation.
 *
 *   { kind: "song" | "place" | "food" | "thing", title, note }
 * ------------------------------------------------------------- */

const DEMO_MENTIONS = [
  { id: 1, kind: "song", title: "Angèle — Balance ton quoi", note: "stuck in her head all week" },
  { id: 2, kind: "place", title: "La Croix-Rousse", note: "her quartier — the hill with all the stairs" },
  { id: 3, kind: "food", title: "une quenelle", note: "what she ate Sunday — very lyonnais" },
];

function MentionGlyph({ kind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  return (
    <svg className="glyph" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {kind === "song" && (
        <>
          <path d="M6.5 13V3.5l8-1.6V11" {...common} />
          <ellipse cx="4.4" cy="13.4" rx="2.6" ry="2.1" {...common} />
          <ellipse cx="12.4" cy="11.4" rx="2.6" ry="2.1" {...common} />
        </>
      )}
      {kind === "place" && (
        <>
          <path d="M9 16s5.5-5.4 5.5-9A5.5 5.5 0 0 0 3.5 7c0 3.6 5.5 9 5.5 9z" {...common} />
          <circle cx="9" cy="7" r="1.8" {...common} />
        </>
      )}
      {kind === "food" && (
        <>
          <path d="M4 2.5v5a2 2 0 0 0 4 0v-5M6 7.5V15.5" {...common} />
          <path d="M13 15.5V2.8c-1.6.8-2.4 2.4-2.4 4.4s.8 2.6 2.4 2.6" {...common} />
        </>
      )}
      {(!kind || kind === "thing") && (
        <>
          <path d="M3.5 4.5h11v9h-11z" {...common} />
          <path d="M6 8h6M6 11h4" {...common} />
        </>
      )}
    </svg>
  );
}

function Mentions({ items }) {
  return (
    <aside className="mentions">
      <div className="mentions-head">
        <span className="micro">She mentioned</span>
        <svg width="126" height="9" viewBox="0 0 126 9" aria-hidden="true">
          <path
            d="M2 5.4c22-2.6 44-3.4 66-2.6s36 2.2 56 1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {items.length === 0 ? (
        <p className="hand mentions-empty">
          Anything she brings up — a song, a place — lands here.
        </p>
      ) : (
        items.map((m, i) => (
          <div
            className="card"
            key={m.id ?? i}
            style={{ transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (0.35 + (i % 3) * 0.08)}deg)` }}
          >
            <MentionGlyph kind={m.kind} />
            <div className="card-title">{m.title}</div>
            {m.note && <div className="hand card-note">{m.note}</div>}
          </div>
        ))
      )}

      <div className="mentions-foot hand">kept with this conversation — look after, not now</div>
    </aside>
  );
}

/** One row of underlined text toggles. */
function ToggleRow({ label, note, options, value, onChange, disabled }) {
  return (
    <div className="toggle-row">
      <div className="toggle-head">
        <span className="micro">{label}</span>
        {note && <span className="note">{note}</span>}
      </div>
      <div className="toggle-options" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`toggle ${value === o.id ? "is-active" : ""}`}
            onClick={() => onChange(o.id)}
            disabled={disabled}
            aria-pressed={value === o.id}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const clientRef = useRef(null);
  const audioRef = useRef(null);
  const [connectionState, setConnectionState] = useState("idle");
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [language, setLanguage] = useState("en");
  const [gender, setGender] = useState("female");
  const [mode, setMode] = useState("friend");
  const [error, setError] = useState(null);
  const [board, setBoard] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [boardSubject, setBoardSubject] = useState(null);

  // Show what the server will actually start the next session with, rather
  // than assuming our defaults match its globals.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SETTINGS_ENDPOINT);
        if (!res.ok) return;
        const s = await res.json();
        if (cancelled) return;
        if (s.language) setLanguage(s.language);
        if (s.gender) setGender(s.gender);
        if (s.mode) setMode(s.mode);
      } catch {
        // server not up yet, or an older build without the endpoint — fine
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Open with ?demo=board to see the panel without the backend wired up.
  useEffect(() => {
    if (isDemo()) {
      setBoard(DEMO_BOARD);
      setBoardSubject("passé composé — être");
      setMentions(DEMO_MENTIONS);
    }
  }, []);

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
        // The teacher writes on the board by sending a message from the
        // server. Shape: { type: "board", entry: {...} } or
        // { type: "board-subject", subject: "..." }.
        onServerMessage: (msg) => {
          if (!msg || typeof msg !== "object") return;
          if (msg.type === "board" && msg.entry) {
            setBoard((prev) => [...prev, { id: prev.length + 1, ...msg.entry }]);
          } else if (msg.type === "mention" && msg.item) {
            setMentions((prev) => [...prev, { id: prev.length + 1, ...msg.item }]);
          } else if (msg.type === "board-subject") {
            setBoardSubject(msg.subject ?? null);
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
    if (!isDemo()) {
      setBoard([]);
      setBoardSubject(null);
      setMentions([]);
    }
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
      await fetch(MODE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
    } catch (err) {
      console.error("Couldn't set session options, connecting with server defaults:", err);
    }

    const client = getClient();
    try {
      await client.connect({ connection_url: SERVER_URL });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Couldn't reach the bot server. Is it running?");
      setConnectionState("idle");
    }
  }, [getClient, language, gender, mode]);

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
  const locked = isConnected || isBusy;

  const personaName = PERSONA_NAMES[language][gender];
  const modeLabel = MODES.find((m) => m.id === mode)?.label ?? "";
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label ?? "";
  const showBoard = mode === "teacher";
  const showMentions = mode === "friend";

  return (
    <div className="fika">
      <audio ref={audioRef} autoPlay playsInline />

      <header className="topbar">
        <span className="wordmark">Fika</span>
        <span className="micro">{isConnected ? `${languageLabel} · ${modeLabel}` : whenItIs()}</span>
      </header>

      {!isConnected ? (
        <main className="stage">
          <section className="persona-col rise d1">
            <span className="micro">Today</span>
            <div className="name-row">
              <SpeakerMark name={personaName} size={64} className="breathe" />
              <h1 className="display">{personaName}</h1>
            </div>
            <p className="blurb">{PERSONA_BLURBS[personaName]}</p>
            <p className="note mode-note">
              {mode === "teacher"
                ? `${personaName} will teach a short lesson and correct you as you go.`
                : `Just a conversation — ${personaName} won't stop to correct you.`}
            </p>
          </section>

          <section className="controls-col rise d2">
            <div className="toggles">
              <ToggleRow
                label="Language"
                options={LANGUAGES.map((l) => ({ id: l.code, label: l.label }))}
                value={language}
                onChange={setLanguage}
                disabled={locked}
              />
              <hr className="rule" />
              <ToggleRow
                label="Voice"
                options={[
                  { id: "female", label: PERSONA_NAMES[language].female },
                  { id: "male", label: PERSONA_NAMES[language].male },
                ]}
                value={gender}
                onChange={setGender}
                disabled={locked}
              />
              <hr className="rule" />
              <ToggleRow
                label="Mode"
                note="applies to your next session"
                options={MODES}
                value={mode}
                onChange={setMode}
                disabled={locked}
              />
            </div>

            <div className="action">
              <button className="cta" onClick={handleConnect} disabled={isBusy}>
                {connectionState === "connecting" ? "Connecting…" : "Start talking"}
              </button>
              <span className="footnote">{STATUS_TEXT[connectionState]}</span>
            </div>

            {error && <div className="error">{error}</div>}
          </section>
        </main>
      ) : (
        <main
          className={`stage ${showBoard ? "stage-board" : showMentions ? "stage-mentions" : "stage-live"}`}
        >
          <section className="live rise d1">
            <div className="name-row">
              <SpeakerMark name={personaName} size={showBoard ? 62 : 72} className="breathe" />
              <h1 className="display">{personaName}</h1>
            </div>
            <span className="micro">
              {languageLabel} · {modeLabel} ·{" "}
              {botSpeaking ? "speaking" : userSpeaking ? "listening" : "waiting"}
            </span>

            <div
              className={`wave ${botSpeaking ? "is-bot" : ""} ${userSpeaking ? "is-user" : ""}`}
              aria-hidden="true"
            >
              {Array.from({ length: showBoard ? 12 : 14 }).map((_, i) => (
                <span className="bar" key={i} />
              ))}
            </div>

            <p className="live-status">
              {botSpeaking
                ? showBoard
                  ? `${personaName} is explaining the last thing on the board.`
                  : `${personaName} is speaking.`
                : userSpeaking
                  ? "Go on, she's listening."
                  : "Answer out loud whenever you're ready. There's no timer on you."}
            </p>

            <button
              className="cta"
              onClick={handleDisconnect}
              disabled={connectionState === "disconnecting"}
            >
              {connectionState === "disconnecting" ? "Ending…" : "End conversation"}
            </button>

            {error && <div className="error">{error}</div>}
          </section>

          {showBoard && <Board entries={board} subject={boardSubject} />}
          {showMentions && <Mentions items={mentions} />}
        </main>
      )}
    </div>
  );
}
