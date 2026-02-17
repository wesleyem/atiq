const STYLE_TAG_ID = "mytruck-anomaly-style";
const CARD_SELECTOR = "[data-cmp='itemCard']";
const CARD_TITLE_SELECTOR = "h2[data-cmp='subheading']";
const CARD_LINK_SELECTOR = "a[data-cmp='link']";
const CARD_SPECS_SELECTOR = "[data-cmp='listingSpecifications']";
const CARD_MILES_SELECTOR =
  "[data-cmp='listingSpecifications'] li, [data-cmp='listingSpecifications'] span";
const CONSIDER_NEW_BANNER_SELECTOR = ".text-blue-darker.text-bold";

const BADGE_ATTR = "data-mytruck-anomaly";
const BADGE_HOST_ATTR = "data-mytruck-anomaly-host";
const BADGE_SELECTOR = `[${BADGE_ATTR}="1"]`;

const RENDER_THROTTLE_MS = 500;
const DEFAULT_CONFIG = {
  milesPerYear: 12000,
  anomalyGoodMiles: -15000,
  anomalyBadMiles: 15000,
  debug: false
};
const WATCHED_KEYS = Object.keys(DEFAULT_CONFIG);

let modelPromise;
let mutationObserver;
let throttleTimer = null;
let renderInFlight = false;
let lastKnownUrl = location.href;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMiles(value) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  const matches = Array.from(
    normalized.matchAll(/([0-9][0-9,]*(?:\.\d+)?)\s*([km])?\s*(?:mi|miles)\b/g)
  );

  for (const match of matches) {
    const snippet = normalized.slice(
      Math.max(0, match.index - 6),
      match.index + match[0].length + 10
    );
    if (snippet.includes("away")) {
      continue;
    }

    let miles = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(miles)) {
      continue;
    }

    const suffix = (match[2] || "").toLowerCase();
    if (suffix === "k") {
      miles *= 1000;
    } else if (suffix === "m") {
      miles *= 1000000;
    }

    if (miles > 0) {
      return Math.round(miles);
    }
  }

  return null;
}

function formatSignedMilesCompact(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);

  if (abs >= 1000) {
    const kValue = abs / 1000;
    const rounded =
      kValue >= 100 ? Math.round(kValue) : Number(kValue.toFixed(1));
    return `${sign}${rounded}k`;
  }

  return `${sign}${Math.round(abs)}`;
}

function formatMilesCompact(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const abs = Math.abs(value);
  if (abs >= 1000) {
    const kValue = abs / 1000;
    const rounded =
      kValue >= 100 ? Math.round(kValue) : Number(kValue.toFixed(1));
    return `${rounded}k`;
  }

  return `${Math.round(abs)}`;
}

function ensureStylesInjected() {
  if (document.getElementById(STYLE_TAG_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = `
[${BADGE_HOST_ATTR}="1"] {
  position: relative;
}

[${BADGE_ATTR}="1"] {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 30;
  max-width: calc(100% - 16px);
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid rgba(17, 24, 39, 0.18);
  background: rgba(255, 255, 255, 0.95);
  color: #111827;
  font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  font-size: 11px;
  line-height: 1.25;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

[${BADGE_ATTR}="1"] .mytruck-anomaly-main {
  display: block;
  font-weight: 700;
}

[${BADGE_ATTR}="1"] .mytruck-anomaly-debug {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 500;
  color: #4b5563;
}

[${BADGE_ATTR}="1"][data-label="LOW"] {
  border-color: rgba(16, 124, 61, 0.35);
  background: rgba(236, 253, 245, 0.96);
  color: #065f46;
}

[${BADGE_ATTR}="1"][data-label="HIGH"] {
  border-color: rgba(185, 28, 28, 0.35);
  background: rgba(254, 242, 242, 0.96);
  color: #991b1b;
}

[${BADGE_ATTR}="1"][data-label="NORMAL"] {
  border-color: rgba(55, 65, 81, 0.28);
  background: rgba(249, 250, 251, 0.96);
  color: #1f2937;
}
`;

  (document.head || document.documentElement).appendChild(style);
}

function isSearchResultsPage() {
  const path = location.pathname || "";
  return path.startsWith("/cars-for-sale") && !path.includes("/vehicle/");
}

function isLikelyListingCard(card) {
  if (!(card instanceof HTMLElement)) {
    return false;
  }

  const title = cleanText(card.querySelector(CARD_TITLE_SELECTOR)?.textContent);
  const hasLink = card.querySelector(CARD_LINK_SELECTOR) !== null;
  const hasSpecs = card.querySelector(CARD_SPECS_SELECTOR) !== null;

  if (!title || !hasLink || !hasSpecs) {
    return false;
  }

  const bannerText = cleanText(
    card.querySelector(CONSIDER_NEW_BANNER_SELECTOR)?.textContent
  ).toLowerCase();
  return !bannerText.includes("consider new");
}

function extractCardData(card) {
  const titleText = cleanText(card.querySelector(CARD_TITLE_SELECTOR)?.textContent);
  const listingYear = parseYear(titleText);

  let listingMiles = null;
  const mileNodes = card.querySelectorAll(CARD_MILES_SELECTOR);
  for (const node of mileNodes) {
    listingMiles = parseMiles(node.textContent);
    if (listingMiles !== null) {
      break;
    }
  }

  if (listingMiles === null) {
    const specsText = cleanText(card.querySelector(CARD_SPECS_SELECTOR)?.textContent);
    listingMiles = parseMiles(specsText);
  }

  return { listingYear, listingMiles };
}

function removeBadge(card) {
  const badge = card.querySelector(BADGE_SELECTOR);
  if (badge) {
    badge.remove();
  }
  card.removeAttribute(BADGE_HOST_ATTR);
}

function upsertBadge(card, modelResult, cfg) {
  let badge = card.querySelector(BADGE_SELECTOR);
  if (!badge) {
    badge = document.createElement("div");
    badge.setAttribute(BADGE_ATTR, "1");
    card.appendChild(badge);
  }

  card.setAttribute(BADGE_HOST_ATTR, "1");
  badge.dataset.label = modelResult.label;

  const mainLine = `Miles: ${formatSignedMilesCompact(modelResult.anomalyMiles)} (${modelResult.label})`;
  const debugLine = cfg.debug
    ? `Exp: ${formatMilesCompact(modelResult.expectedMiles)} | Age: ${modelResult.ageYears}y`
    : "";

  badge.innerHTML = `<span class="mytruck-anomaly-main">${mainLine}</span>${
    debugLine ? `<span class="mytruck-anomaly-debug">${debugLine}</span>` : ""
  }`;
}

function annotateCard(card, cfg, modelApi) {
  if (!isLikelyListingCard(card)) {
    removeBadge(card);
    return;
  }

  const { listingYear, listingMiles } = extractCardData(card);
  if (!Number.isFinite(listingYear) || !Number.isFinite(listingMiles)) {
    removeBadge(card);
    return;
  }

  const result = modelApi.computeMilesAnomaly(listingYear, listingMiles, cfg);
  if (!result) {
    removeBadge(card);
    return;
  }

  upsertBadge(card, result, cfg);
}

function clearAllBadges() {
  const badges = document.querySelectorAll(BADGE_SELECTOR);
  for (const badge of badges) {
    badge.remove();
  }

  const hosts = document.querySelectorAll(`[${BADGE_HOST_ATTR}="1"]`);
  for (const host of hosts) {
    host.removeAttribute(BADGE_HOST_ATTR);
  }
}

async function getModelApi() {
  if (!modelPromise) {
    modelPromise = import(chrome.runtime.getURL("anomalyModel.js"));
  }
  return modelPromise;
}

async function loadConfig() {
  return chrome.storage.sync.get(DEFAULT_CONFIG);
}

async function annotateAllCards(reason) {
  if (renderInFlight) {
    scheduleAnnotate(`${reason}-queued`);
    return;
  }

  renderInFlight = true;

  try {
    if (!isSearchResultsPage()) {
      clearAllBadges();
      return;
    }

    ensureStylesInjected();
    const [cfg, modelApi] = await Promise.all([loadConfig(), getModelApi()]);
    const cards = document.querySelectorAll(CARD_SELECTOR);

    for (const card of cards) {
      annotateCard(card, cfg, modelApi);
    }
  } catch (error) {
    console.error("Miles anomaly annotation failed:", error);
  } finally {
    renderInFlight = false;
  }
}

function scheduleAnnotate(reason) {
  if (throttleTimer !== null) {
    return;
  }

  throttleTimer = window.setTimeout(() => {
    throttleTimer = null;
    void annotateAllCards(reason);
  }, RENDER_THROTTLE_MS);
}

function isInternalBadgeMutation(mutation) {
  if (mutation.target instanceof Element && mutation.target.closest(BADGE_SELECTOR)) {
    return true;
  }

  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (changedNodes.length === 0) {
    return false;
  }

  for (const node of changedNodes) {
    if (!(node instanceof Element)) {
      return false;
    }
    if (!(node.matches(BADGE_SELECTOR) || node.closest(BADGE_SELECTOR))) {
      return false;
    }
  }

  return true;
}

function attachMutationObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver((mutations) => {
    if (location.href !== lastKnownUrl) {
      lastKnownUrl = location.href;
      scheduleAnnotate("url-change");
      return;
    }

    if (!isSearchResultsPage()) {
      return;
    }

    for (const mutation of mutations) {
      if (!isInternalBadgeMutation(mutation)) {
        scheduleAnnotate("mutation");
        return;
      }
    }
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function attachStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    for (const key of WATCHED_KEYS) {
      if (changes[key]) {
        scheduleAnnotate(`storage:${key}`);
        return;
      }
    }
  });
}

function attachNavigationHooks() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushStateHook(...args) {
    const result = originalPushState.apply(this, args);
    scheduleAnnotate("pushState");
    return result;
  };

  history.replaceState = function replaceStateHook(...args) {
    const result = originalReplaceState.apply(this, args);
    scheduleAnnotate("replaceState");
    return result;
  };

  window.addEventListener("popstate", () => {
    scheduleAnnotate("popstate");
  });
}

function init() {
  attachNavigationHooks();
  attachStorageListener();
  attachMutationObserver();
  scheduleAnnotate("init");
}

init();
