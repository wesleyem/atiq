const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const anchorYearInput = document.getElementById("anchorYear");
const anchorMilesInput = document.getElementById("anchorMiles");
const anchorPriceInput = document.getElementById("anchorPrice");
const dollarsPerMileInput = document.getElementById("dollarsPerMile");
const dollarsPerYearInput = document.getElementById("dollarsPerYear");
const goodDealThresholdDollarsInput = document.getElementById(
  "goodDealThresholdDollars"
);
const badDealThresholdDollarsInput = document.getElementById(
  "badDealThresholdDollars"
);
const debugInput = document.getElementById("debug");

const DEFAULT_CONFIG = {
  anchorYear: 2017,
  anchorMiles: 100000,
  anchorPrice: 45000,
  dollarsPerMile: 0.15,
  dollarsPerYear: 1500,
  goodDealThresholdDollars: 2000,
  badDealThresholdDollars: -2000,
  debug: false
};

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function restoreOptions() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);

  anchorYearInput.value = stored.anchorYear;
  anchorMilesInput.value = stored.anchorMiles;
  anchorPriceInput.value = stored.anchorPrice;
  dollarsPerMileInput.value = stored.dollarsPerMile;
  dollarsPerYearInput.value = stored.dollarsPerYear;
  goodDealThresholdDollarsInput.value = stored.goodDealThresholdDollars;
  badDealThresholdDollarsInput.value = stored.badDealThresholdDollars;
  debugInput.checked = Boolean(stored.debug);
}

async function saveOptions(event) {
  event.preventDefault();

  const payload = {
    anchorYear: Math.trunc(numberOrDefault(anchorYearInput.value, DEFAULT_CONFIG.anchorYear)),
    anchorMiles: Math.trunc(
      numberOrDefault(anchorMilesInput.value, DEFAULT_CONFIG.anchorMiles)
    ),
    anchorPrice: numberOrDefault(anchorPriceInput.value, DEFAULT_CONFIG.anchorPrice),
    dollarsPerMile: numberOrDefault(
      dollarsPerMileInput.value,
      DEFAULT_CONFIG.dollarsPerMile
    ),
    dollarsPerYear: numberOrDefault(
      dollarsPerYearInput.value,
      DEFAULT_CONFIG.dollarsPerYear
    ),
    goodDealThresholdDollars: numberOrDefault(
      goodDealThresholdDollarsInput.value,
      DEFAULT_CONFIG.goodDealThresholdDollars
    ),
    badDealThresholdDollars: numberOrDefault(
      badDealThresholdDollarsInput.value,
      DEFAULT_CONFIG.badDealThresholdDollars
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
