const STYLE_TAG_ID = "atq-deal-card-style";
const CARD_SELECTOR = "[data-cmp='itemCard']";
const CARD_LINK_SELECTOR = "a[data-cmp='link']";
const CARD_TITLE_SELECTOR = "h2[data-cmp='subheading']";
const CARD_CONDITION_SELECTOR = "[data-cmp='listingCondition']";
const CARD_PRICE_SELECTOR =
  "[data-cmp='pricing'] [data-cmp='firstPrice'], [data-cmp='firstPrice']";
const CARD_SPECS_SELECTOR = "[data-cmp='listingSpecifications']";
const CARD_MILES_SELECTOR =
  "[data-cmp='listingSpecifications'] li, [data-cmp='listingSpecifications'] span";
const CONSIDER_NEW_BANNER_SELECTOR = ".text-blue-darker.text-bold";
const BADGE_CLASS = "atq-deal-card-badge";
const BADGE_LABEL_CLASS = "atq-deal-card-badge__label";
const BADGE_DELTA_CLASS = "atq-deal-card-badge__delta";
const CARD_HOST_CLASS = "atq-deal-card-host";
const RENDER_THROTTLE_MS = 500;

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

const WATCHED_CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

let modelPromise;
let mutationObserver;
let throttleTimer = null;
let renderInFlight = false;
let lastKnownUrl = location.href;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseCurrencyToNumber(text) {
  const raw = String(text || "");
  const match = raw.match(/-?\$?\s*([0-9][0-9,]*(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseMileageToNumber(text) {
  const normalized = cleanText(text).toLowerCase();
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

    let value = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      continue;
    }

    const suffix = (match[2] || "").toLowerCase();
    if (suffix === "k") {
      value *= 1000;
    } else if (suffix === "m") {
      value *= 1000000;
    }

    if (value > 0) {
      return Math.round(value);
    }
  }

  return null;
}

function parseYearToNumber(text) {
  const match = String(text || "").match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

function parseModelLine(text) {
  const match = String(text || "").match(/\bF[\s-]?(250|350)\b/i);
  if (!match) {
    return null;
  }
  return `F-${match[1]}`;
}

function formatDeltaDollarsCompact(dollars) {
  if (!Number.isFinite(dollars)) {
    return "N/A";
  }

  const sign = dollars >= 0 ? "+" : "-";
  const abs = Math.abs(dollars);
  if (abs >= 1000) {
    const thousands = abs / 1000;
    const rounded = thousands >= 100 ? Math.round(thousands) : Number(thousands.toFixed(1));
    return `${sign}$${rounded}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}

function ensureStylesInjected() {
  if (document.getElementById(STYLE_TAG_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = `
.${CARD_HOST_CLASS} {
  position: relative;
}

.${BADGE_CLASS} {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 24;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  pointer-events: none;
}

.${BADGE_CLASS} .${BADGE_LABEL_CLASS},
.${BADGE_CLASS} .${BADGE_DELTA_CLASS} {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  font-size: 11px;
  line-height: 1.2;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.${BADGE_CLASS} .${BADGE_LABEL_CLASS} {
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #ffffff;
}

.${BADGE_CLASS} .${BADGE_DELTA_CLASS} {
  font-weight: 600;
  color: #111827;
  background: #f3f4f6;
}

.${BADGE_CLASS}.is-good .${BADGE_LABEL_CLASS} {
  background: #1f8f4d;
}

.${BADGE_CLASS}.is-fair .${BADGE_LABEL_CLASS} {
  background: #6b7280;
}

.${BADGE_CLASS}.is-overpriced .${BADGE_LABEL_CLASS} {
  background: #c53929;
}

.${BADGE_CLASS}.is-debug .${BADGE_LABEL_CLASS} {
  background: #1f2937;
}
`;

  (document.head || document.documentElement).appendChild(style);
}

function isSearchResultsPage() {
  const path = location.pathname || "";
  return path.startsWith("/cars-for-sale") && !path.includes("/vehicle/");
}

function isCardVariantB(card) {
  if (!(card instanceof HTMLElement)) {
    return false;
  }

  const isSponsored = card.querySelector(`${CARD_LINK_SELECTOR}[rel*='sponsored']`);
  if (isSponsored) {
    return false;
  }

  const considerNewText = cleanText(
    card.querySelector(CONSIDER_NEW_BANNER_SELECTOR)?.textContent
  ).toLowerCase();
  if (considerNewText.includes("consider new")) {
    return false;
  }

  const condition = cleanText(card.querySelector(CARD_CONDITION_SELECTOR)?.textContent).toLowerCase();
  if (condition !== "used") {
    return false;
  }

  const hasTitle = cleanText(card.querySelector(CARD_TITLE_SELECTOR)?.textContent).length > 0;
  const hasPrice = card.querySelector(CARD_PRICE_SELECTOR) !== null;
  const hasSpecs = card.querySelector(CARD_SPECS_SELECTOR) !== null;
  return hasTitle && hasPrice && hasSpecs;
}

function extractCardData(card) {
  const titleText = cleanText(card.querySelector(CARD_TITLE_SELECTOR)?.textContent);
  const specsText = cleanText(card.querySelector(CARD_SPECS_SELECTOR)?.textContent);
  const priceText = cleanText(card.querySelector(CARD_PRICE_SELECTOR)?.textContent);

  const year = parseYearToNumber(titleText);
  const price = parseCurrencyToNumber(priceText);

  let miles = null;
  const mileNodes = card.querySelectorAll(CARD_MILES_SELECTOR);
  for (const node of mileNodes) {
    miles = parseMileageToNumber(node.textContent);
    if (miles !== null) {
      break;
    }
  }
  if (miles === null) {
    miles = parseMileageToNumber(specsText);
  }

  return {
    year,
    miles,
    price,
    modelLine: parseModelLine(titleText),
    titleText,
    specsText,
    priceText
  };
}

function removeBadge(card) {
  const badge = card.querySelector(`.${BADGE_CLASS}`);
  if (badge) {
    badge.remove();
  }
  card.classList.remove(CARD_HOST_CLASS);
}

function ensureBadgeElement(card) {
  card.classList.add(CARD_HOST_CLASS);
  let badge = card.querySelector(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = document.createElement("div");
    badge.className = BADGE_CLASS;
    card.appendChild(badge);
  }
  return badge;
}

function renderBadge(card, payload) {
  const badge = ensureBadgeElement(card);
  badge.className = BADGE_CLASS;

  if (payload.label === "GOOD") {
    badge.classList.add("is-good");
  } else if (payload.label === "FAIR") {
    badge.classList.add("is-fair");
  } else if (payload.label === "OVERPRICED") {
    badge.classList.add("is-overpriced");
  } else {
    badge.classList.add("is-debug");
  }

  badge.dataset.label = payload.label;
  if (payload.modelLine) {
    badge.dataset.modelLine = payload.modelLine;
  } else {
    delete badge.dataset.modelLine;
  }

  badge.innerHTML = `
    <span class="${BADGE_LABEL_CLASS}">${payload.label}</span>
    <span class="${BADGE_DELTA_CLASS}">${payload.deltaText}</span>
  `;

  if (payload.debugTitle) {
    badge.title = payload.debugTitle;
  } else {
    badge.removeAttribute("title");
  }
}

function annotateCard(card, cfg, modelApi) {
  if (!isCardVariantB(card)) {
    removeBadge(card);
    return;
  }

  const extracted = extractCardData(card);
  const hasData =
    Number.isFinite(extracted.year) &&
    Number.isFinite(extracted.miles) &&
    Number.isFinite(extracted.price);

  if (!hasData) {
    if (cfg.debug) {
      renderBadge(card, {
        label: "N/A",
        deltaText: "N/A",
        modelLine: extracted.modelLine,
        debugTitle: `Missing data: year=${extracted.year ?? "?"}, miles=${
          extracted.miles ?? "?"
        }, price=${extracted.price ?? "?"}`
      });
    } else {
      removeBadge(card);
    }
    return;
  }

  const assessment = modelApi.dealAssessment(
    {
      year: extracted.year,
      miles: extracted.miles,
      price: extracted.price
    },
    cfg
  );

  if (!assessment || !Number.isFinite(assessment.dealDelta)) {
    if (cfg.debug) {
      renderBadge(card, {
        label: "N/A",
        deltaText: "N/A",
        modelLine: extracted.modelLine,
        debugTitle: "Unable to compute deal assessment."
      });
    } else {
      removeBadge(card);
    }
    return;
  }

  renderBadge(card, {
    label: assessment.label,
    deltaText: formatDeltaDollarsCompact(assessment.dealDelta),
    modelLine: extracted.modelLine
  });
}

function clearAllInjectedBadges() {
  const badges = document.querySelectorAll(`.${BADGE_CLASS}`);
  for (const badge of badges) {
    badge.remove();
  }
  const hosts = document.querySelectorAll(`.${CARD_HOST_CLASS}`);
  for (const host of hosts) {
    host.classList.remove(CARD_HOST_CLASS);
  }
}

async function getDealModelApi() {
  if (!modelPromise) {
    modelPromise = import(chrome.runtime.getURL("dealModel.js"));
  }
  return modelPromise;
}

async function loadConfig() {
  return chrome.storage.sync.get(DEFAULT_CONFIG);
}

async function renderAllCards(reason) {
  if (renderInFlight) {
    scheduleRender(`${reason}-queued`);
    return;
  }

  renderInFlight = true;
  try {
    if (!isSearchResultsPage()) {
      clearAllInjectedBadges();
      return;
    }

    ensureStylesInjected();
    const [cfg, modelApi] = await Promise.all([loadConfig(), getDealModelApi()]);
    const cards = document.querySelectorAll(CARD_SELECTOR);
    for (const card of cards) {
      annotateCard(card, cfg, modelApi);
    }
  } catch (error) {
    console.error("AutoTrader deal badge render failed:", error);
  } finally {
    renderInFlight = false;
  }
}

function scheduleRender(reason) {
  if (throttleTimer !== null) {
    return;
  }

  throttleTimer = window.setTimeout(() => {
    throttleTimer = null;
    void renderAllCards(reason);
  }, RENDER_THROTTLE_MS);
}

function isBadgeOnlyMutation(mutation) {
  const target = mutation.target;
  if (target instanceof Element && target.closest(`.${BADGE_CLASS}`)) {
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
    if (!node.classList.contains(BADGE_CLASS) && !node.closest(`.${BADGE_CLASS}`)) {
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
      scheduleRender("url-change");
      return;
    }

    if (!isSearchResultsPage()) {
      return;
    }

    for (const mutation of mutations) {
      if (!isBadgeOnlyMutation(mutation)) {
        scheduleRender("mutation");
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

    for (const key of WATCHED_CONFIG_KEYS) {
      if (changes[key]) {
        scheduleRender(`storage:${key}`);
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
    scheduleRender("pushState");
    return result;
  };

  history.replaceState = function replaceStateHook(...args) {
    const result = originalReplaceState.apply(this, args);
    scheduleRender("replaceState");
    return result;
  };

  window.addEventListener("popstate", () => {
    scheduleRender("popstate");
  });
}

function init() {
  attachNavigationHooks();
  attachStorageListener();
  attachMutationObserver();
  scheduleRender("init");
}

init();
