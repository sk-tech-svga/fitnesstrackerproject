import { auth, cloudEnabled, friends, localProgress, profiles, progress } from "./api.js";
import { bmiLabel, buildPlan, calculate, cmToIn, inToCm, kgToLb, lbToKg, MEALS_PER_DAY } from "./nutrition.js";

const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const STORAGE_KEY = "macronaut.profile";

const form = document.getElementById("calcForm");
const unitToggle = document.getElementById("unitToggle");
const paceField = document.getElementById("paceField");
const paceInput = document.getElementById("pace");
const paceValue = document.getElementById("paceValue");
const timelineCard = document.getElementById("timelineCard");
const saveState = document.getElementById("saveState");
const accountButton = document.getElementById("accountButton");
const accountMenu = document.getElementById("accountMenu");
const authModal = document.getElementById("authModal");
const authMessage = document.getElementById("authMessage");

const state = {
  unit: "metric",
  user: null,
  profile: null,
  result: null,
  pendingEmail: "",
  entries: [],
};

const $ = (id) => document.getElementById(id);
const setText = (id, value) => ($(id).textContent = value);
const weightLabel = (kg) => (state.unit === "metric" ? `${kg.toFixed(1)} kg` : `${kgToLb(kg).toFixed(1)} lb`);
const toKg = (value) => (state.unit === "metric" ? value : lbToKg(value));
const fromKg = (kg) => (state.unit === "metric" ? kg : kgToLb(kg));

/* ---------------------------------------------------------------- calculator */

function readInputs() {
  const data = new FormData(form);
  return {
    age: Number(data.get("age")),
    sex: String(data.get("sex")),
    goal: String(data.get("goal")),
    activity: Number(data.get("activity")),
    heightCm: state.unit === "metric" ? Number(data.get("height")) : inToCm(Number(data.get("height"))),
    weightKg: toKg(Number(data.get("weight"))),
    targetKg: data.get("target") === "" ? null : toKg(Number(data.get("target"))),
    paceKg: toKg(Number(data.get("pace"))),
  };
}

function renderRing(result) {
  const shares = [
    (result.proteinG * 4) / (result.macroCalories || 1),
    (result.carbsG * 4) / (result.macroCalories || 1),
    (result.fatG * 9) / (result.macroCalories || 1),
  ];

  let offset = 0;
  [".seg-protein", ".seg-carbs", ".seg-fat"].forEach((selector, i) => {
    const length = shares[i] * RING_CIRCUMFERENCE;
    const circle = document.querySelector(selector);
    circle.style.strokeDasharray = `${length} ${RING_CIRCUMFERENCE - length}`;
    circle.style.strokeDashoffset = `${-offset}`;
    offset += length;
  });

  setText("ringPct", `${Math.round(shares[0] * 100)}%`);
  setText("proteinSub", `${result.proteinG * 4} kcal · ${Math.round(shares[0] * 100)}%`);
  setText("carbsSub", `${result.carbsG * 4} kcal · ${Math.round(shares[1] * 100)}%`);
  setText("fatSub", `${result.fatG * 9} kcal · ${Math.round(shares[2] * 100)}%`);
}

function renderTimeline(p, result) {
  if (p.targetKg === null || p.goal === "maintain" || Math.abs(result.actualWeeklyKg) < 0.01) {
    timelineCard.hidden = true;
    return;
  }

  const diff = p.targetKg - p.weightKg;
  timelineCard.hidden = false;

  if (Math.abs(diff) < 0.1) {
    $("timelineText").innerHTML = "You are already at your goal weight — switch to <b>Maintain</b> to hold it.";
    return;
  }
  if (Math.sign(diff) !== Math.sign(result.actualWeeklyKg)) {
    $("timelineText").innerHTML = `Your goal weight of <b>${weightLabel(p.targetKg)}</b> moves in the opposite direction of your selected goal. Flip the goal to line them up.`;
    return;
  }

  const weeks = Math.abs(diff / result.actualWeeklyKg);
  const eta = new Date(Date.now() + weeks * 7 * 86400000);
  const dateLabel = eta.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  $("timelineText").innerHTML = `At <b>${weightLabel(Math.abs(result.actualWeeklyKg))} / week</b> you reach <b>${weightLabel(
    p.targetKg
  )}</b> in about <b>${Math.round(weeks)} weeks</b> — around <b>${dateLabel}</b>.`;
}

function renderPlan(p, result) {
  const list = $("planList");
  list.innerHTML = "";
  buildPlan(p, result).forEach((step) => {
    const item = document.createElement("li");
    item.className = "plan-step";
    item.innerHTML = `<p class="plan-title"></p><p class="plan-detail"></p>`;
    item.querySelector(".plan-title").textContent = step.title;
    item.querySelector(".plan-detail").textContent = step.detail;
    list.append(item);
  });
}

function render(p, result) {
  setText("calories", result.calories.toLocaleString());
  setText("bmr", result.bmr.toLocaleString());
  setText("tdee", result.tdee.toLocaleString());
  setText("bmi", `${result.bmi.toFixed(1)} · ${bmiLabel(result.bmi)}`);

  const shift = result.calories - result.tdee;
  if (Math.abs(shift) < 20) {
    setText("deltaNote", "Maintenance calories — eat around your TDEE to hold your weight.");
  } else if (shift < 0) {
    setText("deltaNote", `${Math.abs(Math.round(shift))} kcal deficit · about ${weightLabel(Math.abs(result.actualWeeklyKg))} lost per week`);
  } else {
    setText("deltaNote", `${Math.round(shift)} kcal surplus · about ${weightLabel(result.actualWeeklyKg)} gained per week`);
  }

  setText("protein", result.proteinG);
  setText("carbs", result.carbsG);
  setText("fat", result.fatG);
  renderRing(result);

  setText("water", state.unit === "metric" ? `${result.waterL.toFixed(1)} L` : `${(result.waterL * 33.814).toFixed(0)} fl oz`);
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
  renderPlan(p, result);
}

function update() {
  if (!form.reportValidity()) return;
  const p = readInputs();
  if (!p.age || !p.heightCm || !p.weightKg) return;
  state.result = calculate(p);
  state.stats = p;
  render(p, state.result);
  saveLocal();
  queueCloudSave();
}

/* ------------------------------------------------------------------- storage */

function saveLocal() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.unit = state.unit;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    /* storage unavailable — targets still render */
  }
}

let cloudTimer;
function queueCloudSave() {
  if (!state.user) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(async () => {
    const p = state.stats;
    saveState.textContent = "Saving…";
    try {
      state.profile = await profiles.save(state.user.id, {
        age: p.age,
        sex: p.sex,
        height_cm: Number(p.heightCm.toFixed(1)),
        weight_kg: Number(p.weightKg.toFixed(1)),
        activity: p.activity,
        goal: p.goal,
        pace_kg: Number(p.paceKg.toFixed(2)),
        target_kg: p.targetKg === null ? null : Number(p.targetKg.toFixed(1)),
        unit: state.unit,
      });
      saveState.textContent = `Saved to your account · ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      saveState.textContent = error.message;
    }
  }, 800);
}

function applyStats(profile) {
  if (!profile || profile.height_cm === null) return;
  if (profile.unit === "imperial") switchUnit("imperial");
  $("age").value = profile.age ?? $("age").value;
  form.querySelectorAll('[name="sex"]').forEach((radio) => (radio.checked = radio.value === profile.sex));
  form.querySelectorAll('[name="goal"]').forEach((radio) => (radio.checked = radio.value === profile.goal));
  if (profile.activity) $("activity").value = String(profile.activity);
  if (profile.height_cm) $("height").value = (state.unit === "metric" ? profile.height_cm : cmToIn(profile.height_cm)).toFixed(1);
  if (profile.weight_kg) $("weight").value = fromKg(Number(profile.weight_kg)).toFixed(1);
  if (profile.pace_kg) paceInput.value = fromKg(Number(profile.pace_kg)).toFixed(2);
  $("target").value = profile.target_kg ? fromKg(Number(profile.target_kg)).toFixed(1) : "";
  updatePaceLabel();
  syncGoalUi();
  update();
}

function restoreLocal() {
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

/* --------------------------------------------------------------------- units */

function updatePaceLabel() {
  paceValue.textContent = `${Number(paceInput.value).toFixed(2)} ${state.unit === "metric" ? "kg" : "lb"} / week`;
}

function syncGoalUi() {
  paceField.hidden = new FormData(form).get("goal") === "maintain";
}

function switchUnit(next) {
  if (next === state.unit) return;
  const height = $("height");
  const weight = $("weight");
  const target = $("target");
  const logWeight = $("logWeight");

  const convert = (input, fn, decimals) => {
    if (!input || input.value === "") return;
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
    convert(logWeight, kgToLb, 1);
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
    convert(logWeight, lbToKg, 1);
    convert(paceInput, lbToKg, 2);
  }

  state.unit = next;
  document.querySelectorAll("[data-suffix='height']").forEach((el) => (el.textContent = next === "metric" ? "cm" : "in"));
  document.querySelectorAll("[data-suffix='weight']").forEach((el) => (el.textContent = next === "metric" ? "kg" : "lb"));
  unitToggle.querySelectorAll(".unit-option").forEach((el) => el.classList.toggle("is-active", el.dataset.unit === next));
  updatePaceLabel();
  update();
  renderProgress();
}

/* --------------------------------------------------------------------- views */

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => (view.hidden = view.dataset.view !== name));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === name));
  $("hero").hidden = name !== "calculator";
  if (name === "progress") renderProgress();
  if (name === "friends") renderFriends();
}

document.getElementById("tabs").addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (tab) showView(tab.dataset.view);
});

/* ---------------------------------------------------------------------- auth */

function openAuth(mode = "signin") {
  authModal.hidden = false;
  authMessage.textContent = "";
  document.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.auth === mode));
  $("signinForm").hidden = mode !== "signin";
  $("emailForm").hidden = mode !== "signup";
  $("codeForm").hidden = true;
  $("detailsForm").hidden = true;
  $("authTitle").textContent = mode === "signin" ? "Sign in" : "Create your account";
}

function closeAuth() {
  authModal.hidden = true;
}

function authStep(step) {
  $("signinForm").hidden = true;
  $("emailForm").hidden = step !== "email";
  $("codeForm").hidden = step !== "code";
  $("detailsForm").hidden = step !== "details";
}

async function withBusy(button, action) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Working…";
  authMessage.textContent = "";
  try {
    await action();
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

$("authClose").addEventListener("click", closeAuth);
authModal.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuth();
});
document.querySelectorAll(".auth-tab").forEach((tab) => tab.addEventListener("click", () => openAuth(tab.dataset.auth)));

$("signinForm").addEventListener("submit", (event) => {
  event.preventDefault();
  withBusy(event.submitter, async () => {
    await auth.signIn($("signinUsername").value.trim(), $("signinPassword").value);
    closeAuth();
  });
});

$("emailForm").addEventListener("submit", (event) => {
  event.preventDefault();
  withBusy(event.submitter, async () => {
    state.pendingEmail = $("signupEmail").value.trim();
    await auth.sendCode(state.pendingEmail);
    authStep("code");
    authMessage.textContent = `Email sent to ${state.pendingEmail}. Open the link within an hour to verify.`;
  });
});

$("resendCode").addEventListener("click", (event) => {
  withBusy(event.target, async () => {
    await auth.sendCode(state.pendingEmail);
    authMessage.textContent = "Email sent again.";
  });
});

$("codeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  withBusy(event.submitter, async () => {
    const code = $("signupCode").value.trim();
    if (!code) throw new Error("Open the link in your email, or type the code if the email shows one.");
    await auth.verifyCode(state.pendingEmail, code);
    authStep("details");
    authMessage.textContent = "Email verified.";
  });
});

$("detailsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  withBusy(event.submitter, async () => {
    state.profile = await auth.completeSignup({
      username: $("signupUsername").value.trim(),
      password: $("signupPassword").value,
      email: state.pendingEmail,
    });
    renderProfile();
    queueCloudSave();
    closeAuth();
  });
});

accountButton.addEventListener("click", () => {
  if (!state.user) {
    openAuth(cloudEnabled ? "signin" : "signin");
    if (!cloudEnabled) authMessage.textContent = "Accounts are offline — add your Supabase keys in js/config.js.";
    return;
  }
  accountMenu.hidden = !accountMenu.hidden;
});

accountMenu.addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  accountMenu.hidden = true;
  if (action === "profile") showView("profile");
  if (action === "signout") await auth.signOut();
});

/* ------------------------------------------------------------------- profile */

$("avatarInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || !state.user) return;
  if (file.size > 2 * 1024 * 1024) {
    $("profileState").textContent = "That image is larger than 2 MB.";
    return;
  }
  $("profileState").textContent = "Uploading…";
  try {
    const url = await profiles.uploadAvatar(state.user.id, file);
    state.profile = await profiles.save(state.user.id, { avatar_url: url });
    renderProfile();
    $("profileState").textContent = "Picture updated.";
  } catch (error) {
    $("profileState").textContent = error.message;
  }
});

$("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user) return;
  $("profileState").textContent = "Saving…";
  try {
    state.profile = await profiles.save(state.user.id, {
      username: $("profileUsername").value.trim(),
      bio: $("profileBio").value.trim(),
    });
    renderProfile();
    $("profileState").textContent = "Profile saved.";
  } catch (error) {
    $("profileState").textContent = error.message;
  }
});

function renderProfile() {
  const profile = state.profile;
  if (!profile) return;
  $("profileUsername").value = profile.username || "";
  $("profileBio").value = profile.bio || "";
  if (profile.avatar_url) $("avatarPreview").src = profile.avatar_url;
  accountButton.textContent = profile.username || "Account";
}

/* ------------------------------------------------------------------- friends */

function personRow(person, buttons) {
  const item = document.createElement("li");
  item.className = "person";
  const avatar = person.avatar_url
    ? `<img class="avatar" src="${person.avatar_url}" alt="" />`
    : `<span class="avatar avatar-fallback">${(person.username || "?")[0].toUpperCase()}</span>`;
  item.innerHTML = `${avatar}<div class="person-copy"><p class="person-name"></p><p class="person-bio"></p></div><div class="person-actions"></div>`;
  item.querySelector(".person-name").textContent = person.username;
  item.querySelector(".person-bio").textContent = person.bio || "";
  buttons.forEach(({ label, onClick }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = label;
    button.addEventListener("click", onClick);
    item.querySelector(".person-actions").append(button);
  });
  return item;
}

let searchTimer;
$("friendSearch").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const term = event.target.value.trim();
  searchTimer = setTimeout(async () => {
    const list = $("searchResults");
    list.innerHTML = "";
    if (!state.user || term.length < 2) return;
    const people = await profiles.search(term, state.user.id);
    people.forEach((person) => {
      list.append(
        personRow(person, [
          {
            label: "Add friend",
            onClick: async (clickEvent) => {
              clickEvent.target.disabled = true;
              try {
                await friends.request(state.user.id, person.id);
                clickEvent.target.textContent = "Requested";
                renderFriends();
              } catch (error) {
                clickEvent.target.textContent = error.message.includes("duplicate") ? "Already requested" : "Failed";
              }
            },
          },
        ])
      );
    });
  }, 250);
});

async function renderFriends() {
  const gate = $("friendsGate");
  gate.hidden = Boolean(state.user);
  $("friendSearch").disabled = !state.user;
  if (!state.user) return;

  const rows = await friends.list(state.user.id);
  const requests = rows.filter((row) => row.incoming);
  const accepted = rows.filter((row) => row.status === "accepted");

  const requestList = $("requestList");
  requestList.innerHTML = "";
  requests.forEach((row) =>
    requestList.append(
      personRow(row.person, [
        { label: "Accept", onClick: async () => { await friends.accept(row.id); renderFriends(); } },
        { label: "Decline", onClick: async () => { await friends.remove(row.id); renderFriends(); } },
      ])
    )
  );
  $("requestsEmpty").hidden = requests.length > 0;

  const friendList = $("friendList");
  friendList.innerHTML = "";
  accepted.forEach((row) =>
    friendList.append(
      personRow(row.person, [{ label: "Remove", onClick: async () => { await friends.remove(row.id); renderFriends(); } }])
    )
  );
  $("friendsEmpty").hidden = accepted.length > 0;
}

/* ------------------------------------------------------------------ progress */

$("logDate").value = new Date().toISOString().slice(0, 10);

$("progressForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = {
    logged_on: $("logDate").value,
    weight_kg: Number(toKg(Number($("logWeight").value)).toFixed(1)),
    calories: $("logCalories").value === "" ? null : Number($("logCalories").value),
    protein_g: $("logProtein").value === "" ? null : Number($("logProtein").value),
    note: $("logNote").value.trim() || null,
  };

  $("progressState").textContent = "Saving…";
  try {
    if (state.user) {
      await progress.log(state.user.id, entry);
      state.entries = await progress.list(state.user.id);
    } else {
      state.entries = localProgress.log(entry);
    }
    $("progressState").textContent = state.user ? "Saved to your account." : "Saved on this device.";
    renderProgress();
  } catch (error) {
    $("progressState").textContent = error.message;
  }
});

function renderChart(entries) {
  const svg = $("weightChart");
  svg.innerHTML = "";
  $("chartEmpty").hidden = entries.length > 0;
  if (entries.length < 2) return;

  const values = entries.map((entry) => fromKg(Number(entry.weight_kg)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => (i / (entries.length - 1)) * 560 + 20;
  const y = (value) => 190 - ((value - min) / span) * 150;

  const line = values.map((value, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const area = `${line} L 580 210 L 20 210 Z`;

  svg.insertAdjacentHTML(
    "beforeend",
    `<path class="chart-area" d="${area}" /><path class="chart-line" d="${line}" />` +
      values.map((value, i) => `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3.5" />`).join("")
  );

  const unitLabel = state.unit === "metric" ? "kg" : "lb";
  const change = values[values.length - 1] - values[0];
  setText("trendSummary", `${change >= 0 ? "+" : ""}${change.toFixed(1)} ${unitLabel} over ${entries.length} entries`);
}

function renderProgress() {
  const entries = state.entries;
  renderChart(entries);

  const list = $("entryList");
  list.innerHTML = "";
  [...entries].reverse().forEach((entry) => {
    const item = document.createElement("li");
    item.className = "entry";
    const bits = [`${fromKg(Number(entry.weight_kg)).toFixed(1)} ${state.unit === "metric" ? "kg" : "lb"}`];
    if (entry.calories) bits.push(`${entry.calories} kcal`);
    if (entry.protein_g) bits.push(`${entry.protein_g}g protein`);
    item.innerHTML = `<div><p class="entry-date"></p><p class="entry-note"></p></div><p class="entry-stats"></p><button class="chip" type="button">Delete</button>`;
    item.querySelector(".entry-date").textContent = new Date(`${entry.logged_on}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    item.querySelector(".entry-note").textContent = entry.note || "";
    item.querySelector(".entry-stats").textContent = bits.join(" · ");
    item.querySelector("button").addEventListener("click", async () => {
      if (state.user) {
        await progress.remove(entry.id);
        state.entries = await progress.list(state.user.id);
      } else {
        localProgress.remove(entry.id);
        state.entries = localProgress.list();
      }
      renderProgress();
    });
    list.append(item);
  });
}

/* -------------------------------------------------------------------- session */

async function onUser(user) {
  state.user = user;
  if (!user) {
    state.profile = null;
    state.entries = localProgress.list();
    accountButton.textContent = "Sign in";
    accountMenu.hidden = true;
    saveState.textContent = "";
    renderProgress();
    renderFriends();
    return;
  }

  state.profile = await profiles.get(user.id);

  // Verified through the emailed link but never finished signing up.
  if (!state.profile) {
    state.pendingEmail = user.email;
    openAuth("signup");
    authStep("details");
    authMessage.textContent = `${user.email} is verified — pick a username and password.`;
  }

  accountButton.textContent = state.profile?.username || "Account";
  renderProfile();
  applyStats(state.profile);
  state.entries = await progress.list(user.id);
  renderProgress();
  renderFriends();
  saveState.textContent = "Changes save to your account automatically.";
}

/* ---------------------------------------------------------------------- boot */

unitToggle.addEventListener("click", () => switchUnit(state.unit === "metric" ? "imperial" : "metric"));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  update();
});
form.addEventListener("input", () => {
  updatePaceLabel();
  syncGoalUi();
  update();
});

$("offlineBanner").hidden = cloudEnabled;
restoreLocal();
updatePaceLabel();
syncGoalUi();
update();
state.entries = localProgress.list();
renderProgress();

if (cloudEnabled) {
  auth.onChange((user) => onUser(user));
  const current = await auth.currentUser();
  if (current) await onUser(current);
} else {
  renderFriends();
}
