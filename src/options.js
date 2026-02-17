const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const milesPerYearInput = document.getElementById("milesPerYear");
const milesScaleInput = document.getElementById("milesScale");
const kbbWeightInput = document.getElementById("kbbWeight");
const milesWeightInput = document.getElementById("milesWeight");
const goodDealScoreInput = document.getElementById("goodDealScore");
const poorDealScoreInput = document.getElementById("poorDealScore");
const hideSponsoredCardsInput = document.getElementById("hideSponsoredCards");
const hideSuggestedCardsInput = document.getElementById("hideSuggestedCards");
const hideAdModulesInput = document.getElementById("hideAdModules");
const hideInlineFilterCarouselInput = document.getElementById(
  "hideInlineFilterCarousel"
);
const hideMyWalletCardInput = document.getElementById("hideMyWalletCard");
const hidePreorderCardsInput = document.getElementById("hidePreorderCards");
const debugInput = document.getElementById("debug");

const DEFAULT_CONFIG = {
  milesPerYear: 12000,
  milesScale: 20000,
  kbbWeight: 12,
  milesWeight: 10,
  goodDealScore: 70,
  poorDealScore: 40,
  hideSponsoredCards: true,
  hideSuggestedCards: true,
  hideAdModules: true,
  hideInlineFilterCarousel: true,
  hideMyWalletCard: true,
  hidePreorderCards: true,
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
  goodDealScoreInput.value = stored.goodDealScore;
  poorDealScoreInput.value = stored.poorDealScore;
  hideSponsoredCardsInput.checked = Boolean(stored.hideSponsoredCards);
  hideSuggestedCardsInput.checked = Boolean(stored.hideSuggestedCards);
  hideAdModulesInput.checked = Boolean(stored.hideAdModules);
  hideInlineFilterCarouselInput.checked = Boolean(stored.hideInlineFilterCarousel);
  hideMyWalletCardInput.checked = Boolean(stored.hideMyWalletCard);
  hidePreorderCardsInput.checked = Boolean(stored.hidePreorderCards);
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
    goodDealScore: Math.trunc(
      numberOrDefault(goodDealScoreInput.value, DEFAULT_CONFIG.goodDealScore)
    ),
    poorDealScore: Math.trunc(
      numberOrDefault(poorDealScoreInput.value, DEFAULT_CONFIG.poorDealScore)
    ),
    hideSponsoredCards: hideSponsoredCardsInput.checked,
    hideSuggestedCards: hideSuggestedCardsInput.checked,
    hideAdModules: hideAdModulesInput.checked,
    hideInlineFilterCarousel: hideInlineFilterCarouselInput.checked,
    hideMyWalletCard: hideMyWalletCardInput.checked,
    hidePreorderCards: hidePreorderCardsInput.checked,
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
