const KCAL_PER_KG = 7700;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const STORAGE_KEY = "macronaut.profile";
const MEALS_PER_DAY = 4;

const PROTEIN_PER_KG = { cut: 2.2, maintain: 1.8, bulk: 2.0 };
const FAT_CALORIE_SHARE = { cut: 0.25, maintain: 0.28, bulk: 0.25 };

const form = document.getElementById("calcForm");
const unitToggle = document.getElementById("unitToggle");
const paceField = document.getElementById("paceField");
const paceInput = document.getElementById("pace");
const paceValue = document.getElementById("paceValue");
const timelineCard = document.getElementById("timelineCard");

let unit = "metric";

const lbToKg = (lb) => lb * 0.45359237;
const kgToLb = (kg) => kg / 0.45359237;
const inToCm = (inches) => inches * 2.54;
const cmToIn = (cm) => cm / 2.54;

function readInputs() {
  const data = new FormData(form);
  const rawHeight = Number(data.get("height"));
  const rawWeight = Number(data.get("weight"));
  const rawTarget = data.get("target") === "" ? null : Number(data.get("target"));
  const rawPace = Number(data.get("pace"));

  return {
    age: Number(data.get("age")),
    sex: String(data.get("sex")),
    goal: String(data.get("goal")),
    activity: Number(data.get("activity")),
    heightCm: unit === "metric" ? rawHeight : inToCm(rawHeight),
    weightKg: unit === "metric" ? rawWeight : lbToKg(rawWeight),
    targetKg: rawTarget === null ? null : unit === "metric" ? rawTarget : lbToKg(rawTarget),
    paceKg: unit === "metric" ? rawPace : lbToKg(rawPace),
  };
}

function calculate(p) {
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
  const achievedShift = calories - tdee;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: Math.round(calories),
    bmi: p.weightKg / (heightM * heightM),
    proteinG,
    carbsG,
    fatG,
    macroCalories,
    actualWeeklyKg: (achievedShift * 7) / KCAL_PER_KG,
    waterL: (p.weightKg * 35 + (p.activity - 1.2) * 1000) / 1000,
    fiberG: Math.round((calories / 1000) * 14),
    sugarG: Math.round((calories * 0.1) / 4),
    satFatG: Math.round((calories * 0.1) / 9),
  };
}

function weightLabel(kg) {
  return unit === "metric" ? `${kg.toFixed(1)} kg` : `${kgToLb(kg).toFixed(1)} lb`;
}

function bmiLabel(bmi) {
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "over";
  return "obese";
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function renderRing(result) {
  const proteinCal = result.proteinG * 4;
  const carbCal = result.carbsG * 4;
  const fatCal = result.fatG * 9;
  const total = result.macroCalories || 1;
  const shares = [proteinCal / total, carbCal / total, fatCal / total];
  const segments = [".seg-protein", ".seg-carbs", ".seg-fat"];

  let offset = 0;
  segments.forEach((selector, i) => {
    const length = shares[i] * RING_CIRCUMFERENCE;
    const circle = document.querySelector(selector);
    circle.style.strokeDasharray = `${length} ${RING_CIRCUMFERENCE - length}`;
    circle.style.strokeDashoffset = `${-offset}`;
    offset += length;
  });

  setText("ringPct", `${Math.round(shares[0] * 100)}%`);
  setText("proteinSub", `${Math.round(proteinCal)} kcal · ${Math.round(shares[0] * 100)}%`);
  setText("carbsSub", `${Math.round(carbCal)} kcal · ${Math.round(shares[1] * 100)}%`);
  setText("fatSub", `${Math.round(fatCal)} kcal · ${Math.round(shares[2] * 100)}%`);
}

function renderTimeline(p, result) {
  if (p.targetKg === null || p.goal === "maintain" || Math.abs(result.actualWeeklyKg) < 0.01) {
    timelineCard.hidden = true;
    return;
  }

  const diff = p.targetKg - p.weightKg;
  const movingRightWay = Math.sign(diff) === Math.sign(result.actualWeeklyKg);
  timelineCard.hidden = false;

  if (Math.abs(diff) < 0.1) {
    document.getElementById("timelineText").innerHTML = "You are already at your goal weight — switch to <b>Maintain</b> to hold it.";
    return;
  }
  if (!movingRightWay) {
    document.getElementById("timelineText").innerHTML =
      `Your goal weight of <b>${weightLabel(p.targetKg)}</b> moves in the opposite direction of your selected goal. Flip the goal to line them up.`;
    return;
  }

  const weeks = Math.abs(diff / result.actualWeeklyKg);
  const eta = new Date(Date.now() + weeks * 7 * 86400000);
  const dateLabel = eta.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  document.getElementById("timelineText").innerHTML =
    `At <b>${weightLabel(Math.abs(result.actualWeeklyKg))} / week</b> you reach <b>${weightLabel(p.targetKg)}</b> in about <b>${Math.round(weeks)} weeks</b> — around <b>${dateLabel}</b>.`;
}

function render(p, result) {
  setText("calories", result.calories.toLocaleString());
  setText("bmr", result.bmr.toLocaleString());
  setText("tdee", result.tdee.toLocaleString());
  setText("bmi", `${result.bmi.toFixed(1)} · ${bmiLabel(result.bmi)}`);

  const shift = result.calories - result.tdee;
  const deltaNote = document.getElementById("deltaNote");
  if (Math.abs(shift) < 20) {
    deltaNote.textContent = "Maintenance calories — eat around your TDEE to hold your weight.";
  } else if (shift < 0) {
    deltaNote.textContent = `${Math.abs(Math.round(shift))} kcal deficit · about ${weightLabel(Math.abs(result.actualWeeklyKg))} lost per week`;
  } else {
    deltaNote.textContent = `${Math.round(shift)} kcal surplus · about ${weightLabel(result.actualWeeklyKg)} gained per week`;
  }

  setText("protein", result.proteinG);
  setText("carbs", result.carbsG);
  setText("fat", result.fatG);
  renderRing(result);

  setText("water", unit === "metric" ? `${result.waterL.toFixed(1)} L` : `${(result.waterL * 33.814).toFixed(0)} fl oz`);
  setText("fiber", `${result.fiberG} g`);
  setText("sugar", `under ${result.sugarG} g`);
  setText("satfat", `under ${result.satFatG} g`);

  setText(
    "perMeal",
    `${Math.round(result.calories / MEALS_PER_DAY)} kcal · ${Math.round(result.proteinG / MEALS_PER_DAY)}P / ${Math.round(
      result.carbsG / MEALS_PER_DAY
    )}C / ${Math.round(result.fatG / MEALS_PER_DAY)}F`
  );

  renderTimeline(p, result);
}

function update() {
  if (!form.reportValidity()) return;
  const p = readInputs();
  if (!p.age || !p.heightCm || !p.weightKg) return;
  render(p, calculate(p));
  save();
}

function updatePaceLabel() {
  const unitLabel = unit === "metric" ? "kg" : "lb";
  paceValue.textContent = `${Number(paceInput.value).toFixed(2)} ${unitLabel} / week`;
}

function syncGoalUi() {
  const goal = new FormData(form).get("goal");
  paceField.hidden = goal === "maintain";
}

function switchUnit(next) {
  if (next === unit) return;
  const height = document.getElementById("height");
  const weight = document.getElementById("weight");
  const target = document.getElementById("target");

  const convert = (input, fn, decimals) => {
    if (input.value === "") return;
    input.value = fn(Number(input.value)).toFixed(decimals);
  };

  if (next === "imperial") {
    paceInput.min = "0.25";
    paceInput.max = "2.2";
    height.min = "39"; height.max = "98";
    weight.min = "66"; weight.max = "880";
    target.min = "66"; target.max = "880";
    convert(height, cmToIn, 1);
    convert(weight, kgToLb, 1);
    convert(target, kgToLb, 1);
    convert(paceInput, kgToLb, 2);
  } else {
    paceInput.min = "0.1";
    paceInput.max = "1";
    height.min = "100"; height.max = "250";
    weight.min = "30"; weight.max = "400";
    target.min = "30"; target.max = "400";
    convert(height, inToCm, 1);
    convert(weight, lbToKg, 1);
    convert(target, lbToKg, 1);
    convert(paceInput, lbToKg, 2);
  }

  unit = next;
  document.querySelectorAll("[data-suffix='height']").forEach((el) => (el.textContent = unit === "metric" ? "cm" : "in"));
  document.querySelectorAll("[data-suffix='weight']").forEach((el) => (el.textContent = unit === "metric" ? "kg" : "lb"));
  unitToggle.querySelectorAll(".unit-option").forEach((el) => el.classList.toggle("is-active", el.dataset.unit === unit));

  updatePaceLabel();
  update();
}

function save() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.unit = unit;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    /* storage unavailable — targets still render */
  }
}

function restore() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (err) {
    saved = null;
  }
  if (!saved) return;

  if (saved.unit === "imperial") switchUnit("imperial");
  Object.entries(saved).forEach(([key, value]) => {
    if (key === "unit") return;
    const field = form.elements[key];
    if (!field) return;
    if (field instanceof RadioNodeList || field.type === "radio") {
      form.querySelectorAll(`[name="${key}"]`).forEach((radio) => (radio.checked = radio.value === value));
    } else {
      field.value = value;
    }
  });
}

unitToggle.addEventListener("click", () => switchUnit(unit === "metric" ? "imperial" : "metric"));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  update();
});
form.addEventListener("input", () => {
  updatePaceLabel();
  syncGoalUi();
  update();
});

restore();
updatePaceLabel();
syncGoalUi();
update();
