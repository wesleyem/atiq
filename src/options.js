const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const milesPerYearInput = document.getElementById("milesPerYear");
const anomalyGoodMilesInput = document.getElementById("anomalyGoodMiles");
const anomalyBadMilesInput = document.getElementById("anomalyBadMiles");
const debugInput = document.getElementById("debug");

const DEFAULT_CONFIG = {
  milesPerYear: 12000,
  anomalyGoodMiles: -15000,
  anomalyBadMiles: 15000,
  debug: false
};

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function restoreOptions() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);

  milesPerYearInput.value = stored.milesPerYear;
  anomalyGoodMilesInput.value = stored.anomalyGoodMiles;
  anomalyBadMilesInput.value = stored.anomalyBadMiles;
  debugInput.checked = Boolean(stored.debug);
}

async function saveOptions(event) {
  event.preventDefault();

  const payload = {
    milesPerYear: Math.trunc(
      numberOrDefault(milesPerYearInput.value, DEFAULT_CONFIG.milesPerYear)
    ),
    anomalyGoodMiles: Math.trunc(
      numberOrDefault(anomalyGoodMilesInput.value, DEFAULT_CONFIG.anomalyGoodMiles)
    ),
    anomalyBadMiles: Math.trunc(
      numberOrDefault(anomalyBadMilesInput.value, DEFAULT_CONFIG.anomalyBadMiles)
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
