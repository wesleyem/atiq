const STYLE_TAG_ID = "mytruck-dealscore-style";
const CARD_SELECTOR = "[data-cmp='itemCard']";
const CARD_BODY_SELECTOR = ".item-card-body";
const CARD_TITLE_SELECTOR = "h2[data-cmp='subheading']";
const CARD_LINK_SELECTOR = "a[data-cmp='link']";
const CARD_SPECS_SELECTOR = "[data-cmp='listingSpecifications']";
const CARD_PRICE_SELECTOR = "[data-cmp='firstPrice']";
const CARD_KBB_BADGE_SELECTOR = "[data-cmp='DealBadge']";
const CARD_MILES_SELECTOR =
  "[data-cmp='listingSpecifications'] li, [data-cmp='listingSpecifications'] span";
const CONSIDER_NEW_BANNER_SELECTOR = ".text-blue-darker.text-bold";
const SPONSORED_LINK_SELECTOR =
  "a[data-cmp='link'][rel*='sponsored'], a[data-cmp='link'][href*='clickType=spotlight']";
const CARD_FOOTER_SELECTOR = "[data-cmp='cntnr-listing-footer']";
const SPONSORED_WRAPPER_SELECTOR = "[data-cmp='inventorySpotlightListing']";
const LISTING_SCHEMA_SELECTOR = "script[data-cmp='lstgSchema']";
const FLUID_AD_CONTAINER_SELECTOR = "[data-cmp^='cntnr-fluid-ad']";
const SPOTLIGHT_AD_SLOT_SELECTOR = "[data-cmp='adSlot'][id*='spotlightAd']";
const FILTER_INLINE_CAROUSEL_SELECTOR = "[data-cmp='filter-inline-carousel']";
const FILTER_INLINE_FEATURE_SELECTOR = "[data-cmp='filter-inline-feature']";
const SUGGESTED_CARD_TEXT_MARKERS = [
  "for illustration purposes only",
  "may not match exact trim or color of the vehicle shown"
];

const BADGE_ATTR = "data-mytruck-dealscore";
const BADGE_HOST_ATTR = "data-mytruck-dealscore-host";
const BADGE_SELECTOR = `[${BADGE_ATTR}="1"]`;

const RENDER_THROTTLE_MS = 500;
const DEFAULT_CONFIG = {
  milesPerYear: 12000,
  milesScale: 20000,
  kbbWeight: 12,
  milesWeight: 10,
  goodDealScore: 70,
  poorDealScore: 40,
  debug: false
};
const WATCHED_KEYS = Object.keys(DEFAULT_CONFIG);

let mutationObserver;
let throttleTimer = null;
let renderInFlight = false;
let lastKnownUrl = location.href;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCurrency(value) {
  const normalized = cleanText(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/\$?\s*([0-9][0-9,]*(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1].replace(/,/g, ""));
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

function formatDeltaMilesInK(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const inK = Math.round(value / 1000);
  const sign = inK > 0 ? "+" : "";
  return `${sign}${inK}k`;
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

[${BADGE_ATTR}="1"][data-tier="good"] {
  border-color: rgba(22, 101, 52, 0.4);
  background: rgba(236, 253, 245, 0.96);
  color: #065f46;
}

[${BADGE_ATTR}="1"][data-tier="poor"] {
  border-color: rgba(153, 27, 27, 0.45);
  background: rgba(254, 242, 242, 0.96);
  color: #991b1b;
}

[${BADGE_ATTR}="1"][data-tier="neutral"] {
  border-color: rgba(17, 24, 39, 0.18);
  background: rgba(255, 255, 255, 0.95);
  color: #111827;
}

[${BADGE_ATTR}="1"] .mytruck-anomaly-main {
  display: block;
  font-weight: 700;
}

[${BADGE_ATTR}="1"] .mytruck-dealscore-subline {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 600;
  color: #374151;
}

[${BADGE_ATTR}="1"] .mytruck-anomaly-debug {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 500;
  color: #4b5563;
}
`;

  (document.head || document.documentElement).appendChild(style);
}

function isSearchResultsPage() {
  const path = location.pathname || "";
  return path.startsWith("/cars-for-sale") && !path.includes("/vehicle/");
}

function getCardText(card) {
  return cleanText(card?.textContent).toLowerCase();
}

function getSpotlightContainer(spotlight) {
  const parent = spotlight?.parentElement;
  if (!(parent instanceof HTMLElement)) {
    return null;
  }

  const children = Array.from(parent.children);
  const hasDirectSpotlight = children.includes(spotlight);
  const hasDirectSchema = children.some((child) =>
    child.matches?.(LISTING_SCHEMA_SELECTOR)
  );

  if (hasDirectSpotlight && hasDirectSchema) {
    return parent;
  }

  return null;
}

function getSponsoredRemovalTarget(card) {
  if (!(card instanceof HTMLElement)) {
    return null;
  }

  const spotlight = card.closest(SPONSORED_WRAPPER_SELECTOR);
  if (spotlight) {
    const spotlightContainer = getSpotlightContainer(spotlight);
    if (spotlightContainer) {
      return spotlightContainer;
    }
    return spotlight;
  }

  if (card.querySelector(SPONSORED_LINK_SELECTOR)) {
    return card;
  }

  const footerText = cleanText(card.querySelector(CARD_FOOTER_SELECTOR)?.textContent).toLowerCase();
  if (footerText.includes("sponsored by")) {
    return card;
  }

  return null;
}

function isSuggestedCard(card) {
  if (!(card instanceof HTMLElement)) {
    return false;
  }

  const text = getCardText(card);
  for (const marker of SUGGESTED_CARD_TEXT_MARKERS) {
    if (text.includes(marker)) {
      return true;
    }
  }

  const looksLikeMsrpSuggestion =
    text.includes("starting msrp before options") &&
    card.querySelector(CARD_SPECS_SELECTOR) === null;

  return looksLikeMsrpSuggestion;
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
  const titleNode = card.querySelector(CARD_TITLE_SELECTOR);
  const titleText = cleanText(titleNode?.textContent);
  const listingYear = parseYear(titleText);
  const yearSelectorUsed = listingYear !== null ? CARD_TITLE_SELECTOR : "";

  let listingMiles = null;
  let milesSelectorUsed = "";
  const mileNodes = card.querySelectorAll(CARD_MILES_SELECTOR);
  for (const node of mileNodes) {
    listingMiles = parseMiles(node.textContent);
    if (listingMiles !== null) {
      milesSelectorUsed = CARD_MILES_SELECTOR;
      break;
    }
  }

  if (listingMiles === null) {
    const specsText = cleanText(card.querySelector(CARD_SPECS_SELECTOR)?.textContent);
    listingMiles = parseMiles(specsText);
    if (listingMiles !== null) {
      milesSelectorUsed = CARD_SPECS_SELECTOR;
    }
  }

  const priceText = cleanText(card.querySelector(CARD_PRICE_SELECTOR)?.textContent);
  const listingPrice = parseCurrency(priceText);
  const priceSelectorUsed = listingPrice !== null ? CARD_PRICE_SELECTOR : "";

  const kbbBadge = parseKbbBadge(card);

  return {
    listingYear,
    listingMiles,
    listingPrice,
    kbbBadge,
    selectors: {
      year: yearSelectorUsed,
      miles: milesSelectorUsed,
      price: priceSelectorUsed,
      kbb: kbbBadge.selectorUsed || ""
    }
  };
}

function removeBadge(card) {
  const badges = card.querySelectorAll(BADGE_SELECTOR);
  for (const badge of badges) {
    badge.remove();
  }

  const hosts = card.querySelectorAll(`[${BADGE_HOST_ATTR}="1"]`);
  for (const host of hosts) {
    host.removeAttribute(BADGE_HOST_ATTR);
  }

  card.removeAttribute(BADGE_HOST_ATTR);
}

function removeNodeAndCleanup(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const parent = node.parentElement;
  if (node.isConnected) {
    node.remove();
  }

  if (
    parent instanceof HTMLDivElement &&
    parent.children.length === 0 &&
    cleanText(parent.textContent) === ""
  ) {
    parent.remove();
  }
}

function removeCard(card) {
  removeBadge(card);
  removeNodeAndCleanup(card);
}

function removeSponsoredCard(card) {
  const target = getSponsoredRemovalTarget(card);
  if (!target) {
    return false;
  }

  removeBadge(card);

  if (target.matches(SPONSORED_WRAPPER_SELECTOR)) {
    const schemaScript = target.previousElementSibling;
    if (schemaScript?.matches?.(LISTING_SCHEMA_SELECTOR)) {
      schemaScript.remove();
    }
  }

  removeNodeAndCleanup(target);

  return true;
}

function parseKbbBadge(card) {
  const node = card.querySelector(CARD_KBB_BADGE_SELECTOR);
  const text = cleanText(node?.textContent).toLowerCase();

  if (text.includes("great price")) {
    return { label: "Great", kbbScore: 1.0, selectorUsed: CARD_KBB_BADGE_SELECTOR };
  }

  if (text.includes("good price")) {
    return { label: "Good", kbbScore: 0.5, selectorUsed: CARD_KBB_BADGE_SELECTOR };
  }

  return { label: "—", kbbScore: 0.0, selectorUsed: "" };
}

function getKbbValue(label) {
  const normalized = cleanText(label).toLowerCase();
  if (normalized.includes("great")) {
    return 1.0;
  }
  if (normalized.includes("good")) {
    return 0.5;
  }
  return 0.0;
}

function normalizeConfig(cfg = {}) {
  const goodDealScore = clamp(
    Math.trunc(toNumber(cfg.goodDealScore, DEFAULT_CONFIG.goodDealScore)),
    0,
    100
  );
  const poorDealScore = clamp(
    Math.trunc(toNumber(cfg.poorDealScore, DEFAULT_CONFIG.poorDealScore)),
    0,
    100
  );

  const kbbWeightRaw = Math.max(
    0,
    toNumber(cfg.kbbWeightRaw, toNumber(cfg.kbbWeight, DEFAULT_CONFIG.kbbWeight))
  );
  const milesWeightRaw = Math.max(
    0,
    toNumber(
      cfg.milesWeightRaw,
      toNumber(cfg.milesWeight, DEFAULT_CONFIG.milesWeight)
    )
  );

  return {
    milesPerYear: Math.max(1, Math.trunc(toNumber(cfg.milesPerYear, DEFAULT_CONFIG.milesPerYear))),
    milesScale: Math.max(1, toNumber(cfg.milesScale, DEFAULT_CONFIG.milesScale)),
    kbbWeightRaw,
    milesWeightRaw,
    goodDealScore,
    poorDealScore,
    debug: Boolean(cfg.debug)
  };
}

function computeDealScore(listing, cfg) {
  const listingYear = toNumber(listing?.listingYear, NaN);
  const listingMiles = toNumber(listing?.listingMiles, NaN);

  if (!Number.isFinite(listingYear) || !Number.isFinite(listingMiles)) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const ageYears = Math.max(currentYear - listingYear, 0);
  const expectedMiles = Math.max(ageYears * cfg.milesPerYear, cfg.milesPerYear);
  const deltaMiles = listingMiles - expectedMiles;
  const kbbValue = toNumber(listing?.kbbValue, getKbbValue(listing?.kbbLabel));
  const normalizedKbb = (kbbValue - 0.5) * 2;
  const normalizedMiles = clamp(-deltaMiles / cfg.milesScale, -1, 1);

  const weightSum = cfg.kbbWeightRaw + cfg.milesWeightRaw + 1e-9;
  const normKbbWeight = cfg.kbbWeightRaw / weightSum;
  const normMilesWeight = cfg.milesWeightRaw / weightSum;

  const combined =
    normKbbWeight * normalizedKbb + normMilesWeight * normalizedMiles;
  const scaled = (combined + 1) / 2;
  const dealScore = clamp(Math.round(scaled * 100), 0, 100);

  return {
    listingYear,
    listingMiles,
    ageYears,
    expectedMiles,
    deltaMiles,
    normalizedKbb,
    normalizedMiles,
    normKbbWeight,
    normMilesWeight,
    combined,
    scaled,
    dealScore,
    kbbValue
  };
}

function getBadgeHost(card) {
  const body = card.querySelector(CARD_BODY_SELECTOR);
  if (body instanceof HTMLElement) {
    return body;
  }

  return card;
}

function removeAdModules() {
  const fluidContainers = document.querySelectorAll(FLUID_AD_CONTAINER_SELECTOR);
  for (const container of fluidContainers) {
    removeNodeAndCleanup(container);
  }

  const spotlightAdSlots = document.querySelectorAll(SPOTLIGHT_AD_SLOT_SELECTOR);
  for (const adSlot of spotlightAdSlots) {
    const container = adSlot.closest(FLUID_AD_CONTAINER_SELECTOR);
    removeNodeAndCleanup(container || adSlot);
  }

  const filterCarousels = document.querySelectorAll(FILTER_INLINE_CAROUSEL_SELECTOR);
  for (const carousel of filterCarousels) {
    removeNodeAndCleanup(carousel);
  }

  const inlineFeatures = document.querySelectorAll(FILTER_INLINE_FEATURE_SELECTOR);
  for (const feature of inlineFeatures) {
    const carousel = feature.closest(FILTER_INLINE_CAROUSEL_SELECTOR);
    if (!carousel) {
      removeNodeAndCleanup(feature);
    }
  }
}

function upsertBadge(card, modelResult, cfg) {
  const host = getBadgeHost(card);

  let badge = host.querySelector(BADGE_SELECTOR);
  if (!badge) {
    const staleBadges = card.querySelectorAll(BADGE_SELECTOR);
    for (const staleBadge of staleBadges) {
      staleBadge.remove();
    }

    badge = document.createElement("div");
    badge.setAttribute(BADGE_ATTR, "1");
    host.appendChild(badge);
  }

  host.setAttribute(BADGE_HOST_ATTR, "1");
  const scoreValue = Math.round(modelResult.dealScore);
  let tier = "neutral";
  if (scoreValue >= cfg.goodDealScore) {
    tier = "good";
  } else if (scoreValue <= cfg.poorDealScore) {
    tier = "poor";
  }

  badge.dataset.tier = tier;
  const mainLine = `DealScore: ${scoreValue}`;
  const kbbLine = `KBB: ${modelResult.kbbLabel}`;
  const milesLine = `Miles: ${formatDeltaMilesInK(modelResult.deltaMiles)} vs exp`;
  const debugLine = cfg.debug
    ? [
        `Year: ${modelResult.listingYear} | Miles: ${formatMilesCompact(modelResult.listingMiles)} | Exp: ${formatMilesCompact(modelResult.expectedMiles)}`,
        `Sel y:${modelResult.selectors.year || "—"} m:${modelResult.selectors.miles || "—"} k:${modelResult.selectors.kbb || "—"}`
      ].join("<br>")
    : "";

  badge.innerHTML = `
<span class="mytruck-anomaly-main">${mainLine}</span>
<span class="mytruck-dealscore-subline">${kbbLine}</span>
<span class="mytruck-dealscore-subline">${milesLine}</span>
${debugLine ? `<span class="mytruck-anomaly-debug">${debugLine}</span>` : ""}
`;
}

function annotateCard(card, cfg) {
  if (removeSponsoredCard(card)) {
    return;
  }

  if (isSuggestedCard(card)) {
    removeCard(card);
    return;
  }

  if (!isLikelyListingCard(card)) {
    removeBadge(card);
    return;
  }

  const {
    listingYear,
    listingMiles,
    kbbBadge,
    selectors
  } = extractCardData(card);

  if (!Number.isFinite(listingYear) || !Number.isFinite(listingMiles)) {
    removeBadge(card);
    return;
  }

  const computed = computeDealScore(
    {
      listingYear,
      listingMiles,
      kbbLabel: kbbBadge.label,
      kbbValue: kbbBadge.kbbScore
    },
    cfg
  );
  if (!computed) {
    removeBadge(card);
    return;
  }
  const result = {
    ...computed,
    kbbLabel: kbbBadge.label,
    listingYear,
    listingMiles,
    selectors
  };

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
    const cfg = normalizeConfig(await loadConfig());
    removeAdModules();
    const cards = document.querySelectorAll(CARD_SELECTOR);

    for (const card of cards) {
      annotateCard(card, cfg);
    }
  } catch (error) {
    console.error("DealScore annotation failed:", error);
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
