import { SUPABASE_URL, SUPABASE_ANON_KEY, cloudEnabled } from "./config.js";

let client = null;

if (cloudEnabled) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export { cloudEnabled, client };

function required() {
  if (!client) throw new Error("Accounts are offline: add your Supabase URL and anon key in js/config.js.");
  return client;
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export const auth = {
  /** Step 1 — email a six digit verification code. */
  async sendCode(email) {
    const db = required();
    return unwrap(await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
  },

  /** Step 2 — exchange the emailed code for a session. */
  async verifyCode(email, token) {
    const db = required();
    return unwrap(await db.auth.verifyOtp({ email, token, type: "email" }));
  },

  /** Step 3 — pick a username and password for the verified account. */
  async completeSignup({ username, password, email }) {
    const db = required();
    const available = unwrap(await db.rpc("username_available", { lookup_username: username }));
    if (!available) throw new Error("That username is taken.");
    unwrap(await db.auth.updateUser({ password }));
    const user = (await db.auth.getUser()).data.user;
    return unwrap(
      await db.from("profiles").upsert({ id: user.id, username, email: email || user.email }).select().single()
    );
  },

  async signIn(username, password) {
    const db = required();
    const email = username.includes("@") ? username : unwrap(await db.rpc("email_for_username", { lookup_username: username }));
    if (!email) throw new Error("No account with that username.");
    return unwrap(await db.auth.signInWithPassword({ email, password }));
  },

  async signOut() {
    if (client) await client.auth.signOut();
  },

  async currentUser() {
    if (!client) return null;
    return (await client.auth.getUser()).data.user ?? null;
  },

  onChange(callback) {
    if (!client) return;
    client.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
  },
};

export const profiles = {
  async get(id) {
    const db = required();
    const { data, error } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async save(id, patch) {
    const db = required();
    return unwrap(
      await db
        .from("profiles")
        .upsert({ id, ...patch, updated_at: new Date().toISOString() })
        .select()
        .single()
    );
  },

  async uploadAvatar(id, file) {
    const db = required();
    const extension = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${id}/avatar.${extension}`;
    const { error } = await db.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "0" });
    if (error) throw new Error(error.message);
    const url = db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    return `${url}?v=${Date.now()}`;
  },

  async search(term, excludeId) {
    const db = required();
    return unwrap(
      await db
        .from("profiles")
        .select("id, username, avatar_url, bio")
        .ilike("username", `%${term}%`)
        .neq("id", excludeId)
        .limit(10)
    );
  },
};

export const friends = {
  async list(userId) {
    const db = required();
    const rows = unwrap(
      await db
        .from("friendships")
        .select("id, status, requester_id, addressee_id, requester:requester_id(id, username, avatar_url, bio), addressee:addressee_id(id, username, avatar_url, bio)")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .order("created_at", { ascending: false })
    );

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      incoming: row.addressee_id === userId && row.status === "pending",
      person: row.requester_id === userId ? row.addressee : row.requester,
    }));
  },

  async request(requesterId, addresseeId) {
    const db = required();
    return unwrap(await db.from("friendships").insert({ requester_id: requesterId, addressee_id: addresseeId }).select().single());
  },

  async accept(id) {
    const db = required();
    return unwrap(await db.from("friendships").update({ status: "accepted" }).eq("id", id).select().single());
  },

  async remove(id) {
    const db = required();
    const { error } = await db.from("friendships").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

export const progress = {
  async list(userId) {
    const db = required();
    return unwrap(await db.from("progress_entries").select("*").eq("user_id", userId).order("logged_on", { ascending: true }));
  },

  async log(userId, entry) {
    const db = required();
    return unwrap(
      await db
        .from("progress_entries")
        .upsert({ user_id: userId, ...entry }, { onConflict: "user_id,logged_on" })
        .select()
        .single()
    );
  },

  async remove(id) {
    const db = required();
    const { error } = await db.from("progress_entries").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

/** Progress log for visitors without an account. */
export const localProgress = {
  key: "macronaut.progress",
  list() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "[]").sort((a, b) => a.logged_on.localeCompare(b.logged_on));
    } catch (err) {
      return [];
    }
  },
  log(entry) {
    const rows = this.list().filter((row) => row.logged_on !== entry.logged_on);
    rows.push({ id: entry.logged_on, ...entry });
    localStorage.setItem(this.key, JSON.stringify(rows));
    return rows;
  },
  remove(id) {
    localStorage.setItem(this.key, JSON.stringify(this.list().filter((row) => row.id !== id)));
  },
};
