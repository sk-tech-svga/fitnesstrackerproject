// Supabase project credentials (Settings -> API). Both values are safe to ship
// in a browser app: the publishable/anon key only grants whatever the row level
// security policies in supabase/schema.sql allow. Never put a service role key
// here. Blank them out and the site falls back to offline mode: the calculator
// works and everything is stored in localStorage instead of an account.
export const SUPABASE_URL = "https://jlknmgmsetwvmnojjbtf.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_Ah_oFl9zW3_01PJNnl1SKg__UgDpwA2";

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
