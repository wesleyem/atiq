const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const milesPerYearInput = document.getElementById("milesPerYear");
const milesScaleInput = document.getElementById("milesScale");
const kbbWeightInput = document.getElementById("kbbWeight");
const milesWeightInput = document.getElementById("milesWeight");
const debugInput = document.getElementById("debug");

const DEFAULT_CONFIG = {
  milesPerYear: 12000,
  milesScale: 20000,
  kbbWeight: 12,
  milesWeight: 10,
  debug: false
};

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function restoreOptions() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);

  milesPerYearInput.value = stored.milesPerYear;
  milesScaleInput.value = stored.milesScale;
  kbbWeightInput.value = stored.kbbWeight;
  milesWeightInput.value = stored.milesWeight;
  debugInput.checked = Boolean(stored.debug);
}

async function saveOptions(event) {
  event.preventDefault();

  const payload = {
    milesPerYear: Math.trunc(
      numberOrDefault(milesPerYearInput.value, DEFAULT_CONFIG.milesPerYear)
    ),
    milesScale: Math.trunc(
      numberOrDefault(milesScaleInput.value, DEFAULT_CONFIG.milesScale)
    ),
    kbbWeight: numberOrDefault(kbbWeightInput.value, DEFAULT_CONFIG.kbbWeight),
    milesWeight: numberOrDefault(
      milesWeightInput.value,
      DEFAULT_CONFIG.milesWeight
    ),
    debug: debugInput.checked
  };

  await chrome.storage.sync.set(payload);
  statusEl.textContent = "Saved.";
  window.setTimeout(() => {
    statusEl.textContent = "";
  }, 1200);
}

form.addEventListener("submit", saveOptions);
restoreOptions();
