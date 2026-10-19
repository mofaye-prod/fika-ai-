import { useState } from "react";
import { supabase } from "./supabase";

const AGE_RANGES = [
  { id: "18-24", label: "18 – 24" },
  { id: "25-34", label: "25 – 34" },
  { id: "35-49", label: "35 – 49" },
  { id: "50+", label: "50 or over" },
];

const LEVELS = [
  { code: "A1", desc: "Just starting" },
  { code: "A2", desc: "A few basics, slowly" },
  { code: "B1", desc: "Can hold a conversation" },
  { code: "B2", desc: "Comfortable, still slip" },
  { code: "C1", desc: "Fluent, staying sharp" },
];

const ONB_LANGS = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];

function Tick({ on }) {
  return (
    <span className={`onb-tick ${on ? "on" : ""}`}>
      {on && (
        <svg width="10" height="8" viewBox="0 0 9 7" aria-hidden="true">
          <path
            d="M1 3.6L3.4 6 8 1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

export default function Onboarding({ session, onComplete }) {
  const [step, setStep] = useState(1);
  const [age, setAge] = useState(null);
  const [lang, setLang] = useState("fr");
  const [level, setLevel] = useState("B1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function finish() {
    setSaving(true);
    setError(null);
    const row = {
      user_id: session.user.id,
      age_range: age,
      levels: { [lang]: level },
      default_language: lang,
      default_mode: "friend",
    };
    const { data, error } = await supabase
      .from("profiles")
      .insert(row)
      .select()
      .single();
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    onComplete(data);
  }

  return (
    <div className="onb">
      <div className="onb-top">
        <span className="wordmark">fika</span>
        <div className="onb-progress">
          <span className={`onb-dash ${step >= 1 ? "on" : ""}`} />
          <span className={`onb-dash ${step >= 2 ? "on" : ""}`} />
          <span className="micro">Step {step} of 2</span>
        </div>
      </div>

      {step === 1 ? (
        <div className="onb-mid onb-mid-center">
          <div className="onb-col">
            <span className="micro">About you</span>
            <h1 className="onb-h1">How old are you?</h1>
            <p className="onb-sub">
              It changes what gets brought up, not the way you're spoken to.
            </p>

            <div className="onb-grid">
              {AGE_RANGES.map((a) => (
                <button
                  key={a.id}
                  className={`onb-opt ${age === a.id ? "on" : ""}`}
                  onClick={() => setAge(a.id)}
                >
                  <span className="onb-opt-label">{a.label}</span>
                  <Tick on={age === a.id} />
                </button>
              ))}
            </div>

            <div className="onb-actions">
              <button
                className="onb-cta"
                disabled={!age}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
              <span className="hand onb-aside">you can change this later</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="onb-mid onb-mid-split">
          <div className="onb-col">
            <span className="micro">Where you're starting</span>
            <h1 className="onb-h1">How far along are you?</h1>
            <p className="onb-sub">
              Sets the pace, and how often you get stopped. It adjusts as you go.
            </p>

            <div className="onb-langs">
              <span className="micro">Starting with</span>
              {ONB_LANGS.map((l) => (
                <button
                  key={l.id}
                  className={`onb-lang ${lang === l.id ? "on" : ""}`}
                  onClick={() => setLang(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="onb-actions">
              <button className="onb-cta" disabled={saving} onClick={finish}>
                {saving ? "One moment…" : "Start talking"}
              </button>
              <span className="hand onb-aside">
                you'll set this again for each language
              </span>
            </div>

            {error && <div className="error">{error}</div>}
          </div>

          <div className="onb-levels">
            {LEVELS.map((l) => (
              <button
                key={l.code}
                className={`onb-opt onb-level ${level === l.code ? "on" : ""}`}
                onClick={() => setLevel(l.code)}
              >
                <span className="onb-code">{l.code}</span>
                <span className="onb-desc">{l.desc}</span>
              </button>
            ))}
            <button
              className={`onb-opt onb-level onb-unsure ${
                level === "B1?" ? "on" : ""
              }`}
              onClick={() => setLevel("B1?")}
            >
              <span className="onb-code onb-q">?</span>
              <span className="onb-desc">Not sure — let them work it out</span>
            </button>
          </div>
        </div>
      )}

      <div className="onb-bottom">
        <span className="micro">A conversation, not a course</span>
        <span className="onb-note">
          {step === 1 ? "Two questions, then you're talking" : "Last one"}
        </span>
      </div>
    </div>
  );
}