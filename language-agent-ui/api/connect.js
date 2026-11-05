import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const key = process.env.PIPECAT_PUBLIC_KEY;
  const agent = process.env.PIPECAT_AGENT_NAME ?? "fika";
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!key) {
    return res.status(500).json({ error: "PIPECAT_PUBLIC_KEY is not set" });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase env vars are not set" });
  }

  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired access token" });
    }

    const upstream = await fetch(
      `https://api.pipecat.daily.co/v1/public/${agent}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          createDailyRoom: true,
          // The bot reads recaps with a key that bypasses RLS, using this id.
          // It must come from the verified token, never from the request, so
          // it goes last to overwrite anything the client sent.
          body: { ...req.body, user_id: data.user.id },
        }),
      },
    );

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    return res.status(502).json({ error: String(err) });
  }
}
