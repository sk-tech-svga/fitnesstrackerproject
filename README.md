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

## Running locally

No build step — it is plain HTML, CSS and JavaScript.

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Files

- `index.html` — markup
- `styles.css` — styling
- `app.js` — nutrition math and rendering

Estimates only; not medical advice.
