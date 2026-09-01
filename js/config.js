// Fill these in with your Supabase project credentials (Settings -> API).
// Both values are safe to ship in a browser app: the anon key only grants
// whatever the row level security policies in supabase/schema.sql allow.
// While they are empty the site runs in offline mode: the calculator works and
// everything is stored in localStorage instead of an account.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
