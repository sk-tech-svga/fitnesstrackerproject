export const KCAL_PER_KG = 7700;
export const MEALS_PER_DAY = 4;

const PROTEIN_PER_KG = { cut: 2.2, maintain: 1.8, bulk: 2.0 };
const FAT_CALORIE_SHARE = { cut: 0.25, maintain: 0.28, bulk: 0.25 };

export const lbToKg = (lb) => lb * 0.45359237;
export const kgToLb = (kg) => kg / 0.45359237;
export const inToCm = (inches) => inches * 2.54;
export const cmToIn = (cm) => cm / 2.54;

export function calculate(p) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  const bmr = p.sex === "male" ? base + 5 : base - 161;
  const tdee = bmr * p.activity;

  const dailyShift = (p.paceKg * KCAL_PER_KG) / 7;
  let calories = tdee;
  if (p.goal === "cut") calories = Math.max(tdee - dailyShift, bmr, tdee * 0.7);
  if (p.goal === "bulk") calories = tdee + Math.min(dailyShift, tdee * 0.2);

  const proteinG = Math.round(p.weightKg * PROTEIN_PER_KG[p.goal]);
  const fatG = Math.max(Math.round((calories * FAT_CALORIE_SHARE[p.goal]) / 9), Math.round(p.weightKg * 0.6));
  const carbsG = Math.max(Math.round((calories - proteinG * 4 - fatG * 9) / 4), 0);
  const macroCalories = proteinG * 4 + carbsG * 4 + fatG * 9;
  const heightM = p.heightCm / 100;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: Math.round(calories),
    bmi: p.weightKg / (heightM * heightM),
    proteinG,
    carbsG,
    fatG,
    macroCalories,
    actualWeeklyKg: ((calories - tdee) * 7) / KCAL_PER_KG,
    waterL: (p.weightKg * 35 + (p.activity - 1.2) * 1000) / 1000,
    fiberG: Math.round((calories / 1000) * 14),
    sugarG: Math.round((calories * 0.1) / 4),
    satFatG: Math.round((calories * 0.1) / 9),
  };
}

export function bmiLabel(bmi) {
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "over";
  return "obese";
}

const TRAINING_DAYS = { 1.2: 3, 1.375: 3, 1.55: 4, 1.725: 5, 1.9: 6 };

const SPLITS = {
  3: ["Full body A", "Full body B", "Full body C"],
  4: ["Upper body", "Lower body", "Push + core", "Pull + conditioning"],
  5: ["Push", "Pull", "Legs", "Upper body", "Conditioning + core"],
  6: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"],
};

/** Builds an ordered, week-by-week plan from the user's stats and targets. */
export function buildPlan(profile, result) {
  const days = TRAINING_DAYS[profile.activity] || 4;
  const steps = [];

  steps.push({
    title: "Lock in your daily targets",
    detail: `Eat ${result.calories.toLocaleString()} kcal a day: ${result.proteinG}g protein, ${result.carbsG}g carbs, ${result.fatG}g fat. Protein is the number to hit first — the others can flex.`,
  });

  steps.push({
    title: `Train ${days} days a week`,
    detail: `${SPLITS[days].join(" · ")}. Add a little weight or one more rep whenever you finish all your sets at the top of the rep range.`,
  });

  steps.push({
    title: "Build each plate the same way",
    detail: `Across ${MEALS_PER_DAY} meals that is about ${Math.round(result.proteinG / MEALS_PER_DAY)}g protein, ${Math.round(
      result.carbsG / MEALS_PER_DAY
    )}g carbs and ${Math.round(result.fatG / MEALS_PER_DAY)}g fat per meal — a palm of protein, a fist of carbs, veg, and a thumb of fat.`,
  });

  steps.push({
    title: "Hit the supporting numbers",
    detail: `${result.waterL.toFixed(1)} L of water and ${result.fiberG}g fiber daily, 7–9 hours of sleep, and 8–10k steps on non-training days.`,
  });

  steps.push({
    title: "Weigh in and log it",
    detail:
      "Same time every morning, after the bathroom, before food. Judge progress on the 7-day average, not a single day — water weight swings 1–2 kg.",
  });

  if (profile.goal !== "maintain" && profile.targetKg) {
    const diff = profile.targetKg - profile.weightKg;
    const weekly = result.actualWeeklyKg;
    if (Math.abs(weekly) > 0.01 && Math.sign(diff) === Math.sign(weekly)) {
      const weeks = Math.ceil(Math.abs(diff / weekly));
      const checkpoints = [];
      for (let w = 2; w <= Math.min(weeks, 12); w += 2) {
        checkpoints.push(`Week ${w}: ${(profile.weightKg + weekly * w).toFixed(1)} kg`);
      }
      steps.push({
        title: `Checkpoints on the way to ${profile.targetKg} kg`,
        detail: `${checkpoints.join(" · ")}. If two weeks pass with no movement, adjust calories by 100–150, not more.`,
      });
    }
  }

  steps.push({
    title: "Recalculate every 4 weeks",
    detail: "Your calorie needs move with your body weight. Update your weight here once a month and the targets adjust with you.",
  });

  return steps;
}
