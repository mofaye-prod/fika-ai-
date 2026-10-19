import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const AGE_RANGES = [
  { id: "18-24", label: "18–24" },
  { id: "25-34", label: "25–34" },
  { id: "35-49", label: "35–49" },
  { id: "50+", label: "50+" },
];
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const LANGS = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];
const MODES = [
  { id: "friend", label: "Friend" },
  { id: "teacher", label: "Teacher" },
];

function when(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function isThisWeek(iso) {
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function summarise(row) {
  const entries = row.board?.entries ?? [];
  const mentions = row.mentions ?? [];
  if (row.mode === "teacher") {
    const title = row.board?.subject || "No subject set";
    const peek = entries
      .map((e) => e.right || e.text || e.note)
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ");
    return { title, peek, count: entries.length ? `${entries.length} on the board` : "—" };
  }
  const title = mentions[0]?.title || "Just talking";
  const peek = mentions.slice(1, 3).map((m) => m.title).join(" · ");
  return { title, peek, count: mentions.length ? `${mentions.length} mentions` : "—" };
}

export default function Profile({
  session,
  profile,
  onProfileChange,
  onBack,
  SpeakerMark,
  Board,
  Mentions,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("sessions")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        setRows(data ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function patch(fields) {
    const { data, error } = await supabase
      .from("profiles")
      .update(fields)
      .eq("user_id", session.user.id)
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    onProfileChange(data);
  }

  const lang = profile.default_language ?? "fr";
  const level = profile.levels?.[lang] ?? null;
  const initial = (session.user.email ?? "?")[0].toUpperCase();

  const thisWeek = rows.filter((r) => isThisWeek(r.created_at));
  const earlier = rows.filter((r) => !isThisWeek(r.created_at));

  function Row({ row }) {
    const s = summarise(row);
    const persona = row.transcript?.persona_name;
    return (
      <button className="pro-row" onClick={() => setOpen(row)}>
        <span className="pro-date">{when(row.created_at)}</span>
        {SpeakerMark && persona ? (
          <SpeakerMark name={persona} size={26} />
        ) : (
          <span className="pro-dot" />
        )}
        <span className="pro-main">
          <span className="pro-title">{s.title}</span>
          {s.peek && <span className="pro-peek">{s.peek}</span>}
        </span>
        <span className={`pro-tag ${row.mode === "teacher" ? "t" : ""}`}>
          {row.mode}
        </span>
        <span className="pro-count">{s.count}</span>
      </button>
    );
  }

  if (open) {
    const entries = open.board?.entries ?? [];
    const mentions = open.mentions ?? [];
    return (
      <div className="pro">
        <div className="pro-top">
          <span className="wordmark">fika</span>
          <button className="linkbtn" onClick={() => setOpen(null)}>
            ← Notebook
          </button>
        </div>
        <div className="pro-detail">
          <div className="pro-detail-head">
            <h1 className="pro-h1">
              {open.board?.subject || (open.mode === "teacher" ? "A lesson" : "A conversation")}
            </h1>
            <span className="micro">
              {when(open.created_at)} · {open.language} · {open.mode}
            </span>
          </div>
          <div className="pro-detail-body">
            {open.mode === "teacher" && Board && entries.length > 0 && (
              <Board entries={entries} subject={open.board?.subject} />
            )}
            {open.mode === "friend" && Mentions && mentions.length > 0 && (
              <Mentions items={mentions} />
            )}
            {entries.length === 0 && mentions.length === 0 && (
              <p className="pro-empty">Nothing was written down in this one.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pro">
      <div className="pro-top">
        <div className="pro-nav">
          <span className="wordmark">fika</span>
          <button className="pro-navlink" onClick={onBack}>
            Talk
          </button>
          <span className="pro-navlink on">You</span>
        </div>
      </div>

      <div className="pro-body">
        <aside className="pro-side">
          <div className="pro-id">
            <span className="pro-avatar">{initial}</span>
            <span className="pro-email">{session.user.email}</span>
          </div>

          <div className="pro-field">
            <span className="micro">Your level</span>
            <div className="pro-chips">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  className={`pro-chip ${level === l ? "on" : ""}`}
                  onClick={() => patch({ levels: { ...profile.levels, [lang]: l } })}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="pro-hint">
              Sets the pace and how often you get corrected.
            </span>
          </div>

          <div className="pro-field">
            <span className="micro">Age range</span>
            <div className="pro-chips">
              {AGE_RANGES.map((a) => (
                <button
                  key={a.id}
                  className={`pro-chip ${profile.age_range === a.id ? "on" : ""}`}
                  onClick={() => patch({ age_range: a.id })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pro-field">
            <span className="micro">Starts on</span>
            <div className="pro-chips">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  className={`pro-chip ${lang === l.id ? "on" : ""}`}
                  onClick={() => patch({ default_language: l.id })}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="pro-chips">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  className={`pro-chip ${profile.default_mode === m.id ? "on" : ""}`}
                  onClick={() => patch({ default_mode: m.id })}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pro-stat">
            <span className="pro-stat-n">{rows.length}</span>
            <span className="micro">Conversations</span>
          </div>
        </aside>

        <main className="pro-main-col">
          <h1 className="pro-h1">Your notebook</h1>
          <p className="pro-sub">
            Everything written down, and everything recommended. Open one to see
            the board exactly as it was.
          </p>

          {error && <div className="error">{error}</div>}
          {loading && <p className="pro-empty">Loading…</p>}

          {!loading && rows.length === 0 && (
            <p className="pro-empty">
              Nothing here yet. Your conversations will show up as you have them.
            </p>
          )}

          {thisWeek.length > 0 && (
            <>
              <div className="micro pro-group">This week</div>
              {thisWeek.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </>
          )}

          {earlier.length > 0 && (
            <>
              <div className="micro pro-group">Earlier</div>
              {earlier.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}