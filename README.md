# Macronaut

A fitness / nutrition target calculator. Enter your stats and it works out your daily energy needs and splits them into macros.

**Live site:** https://sk-tech-svga.github.io/fitnesstrackerproject/

## What it calculates

- **BMR** (Mifflin–St Jeor) and **TDEE** from your activity level
- **Daily calorie target** adjusted for your goal (lose fat / maintain / build muscle) and weekly pace
- **Macros** — protein, carbs and fat in grams, kcal and percentages
- **Water, fiber, sugar cap and saturated fat cap**
- **Per-meal split** across 4 meals a day
- **Projected timeline** to an optional goal weight

Metric and imperial units are both supported, and your inputs are saved in `localStorage`.

## Accounts

With a Supabase project configured the site also has accounts: sign up with an email,
verify the six digit code that lands in your inbox, then pick a username and password
(you log in with the username). An account gets a profile picture, bio, friend
requests, saved calculator stats and a weight/progress log with a trend chart.

Without Supabase credentials the site runs offline: the calculator and the step by step
plan work as normal and progress entries are kept in `localStorage`.

### Setting up Supabase

1. Create a free project at https://supabase.com.
2. In the SQL editor run [`supabase/schema.sql`](supabase/schema.sql) — it creates the
   `profiles`, `friendships` and `progress_entries` tables, the row level security
   policies, the username lookup functions and the public `avatars` bucket.
3. Copy **Project URL** and the **anon public** key from Settings → API into
   [`js/config.js`](js/config.js). Both are safe to ship in the browser; RLS is what
   protects the data. Never put the service role key here.
4. Under Authentication → Providers → Email make sure email is enabled, and add the
   site URL (e.g. the GitHub Pages URL) under Authentication → URL Configuration.
5. Optional: Authentication → Email Templates → Magic Link — include `{{ .Token }}` so
   the email shows the six digit code.

## Running locally

No build step — it is plain HTML, CSS and JavaScript.

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Files

- `index.html` — markup for the calculator, plan, progress, friends and profile views
- `styles.css` — styling
- `js/nutrition.js` — nutrition math and the step by step plan generator
- `js/api.js` — Supabase auth, profiles, friends and progress (plus the offline fallback)
- `js/config.js` — your Supabase URL and anon key
- `js/app.js` — state, rendering and event wiring
- `supabase/schema.sql` — tables, policies and storage setup

Estimates only; not medical advice.
