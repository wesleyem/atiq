const OVERLAY_ID = "autotrader-deal-overlay";
const RENDER_THROTTLE_MS = 350;
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
const PRICE_SELECTORS = [
  "[data-cmp='pricing'] [data-cmp='firstPrice']",
  "[data-cmp='pricingBreakdown'] tr:first-child td:last-child",
  "[data-cmp='firstPrice']",
  "[data-cmp='pricing']",
  "[data-cmp='priceSection'] [data-cmp='heading'] + div",
  "[data-cmp='price']",
  "[data-testid*='price']",
  "h2",
  "h3"
];
const YEAR_SELECTORS = [
  "#vehicle-details-heading",
  "[data-cmp='listingTitleContainer'] h1[data-cmp='heading']",
  "[data-cmp='listingTitleContainer'] h1",
  "h1",
  "[data-cmp='heading']",
  "[data-testid*='title']",
  "title"
];
const MILES_SELECTORS = [
  "[data-cmp='listingTitleContainer'] + [data-cmp='section'] span.no-wrap",
  "[data-cmp='listingTitleContainer'] + [data-cmp='section'] span",
  "[data-cmp='mileage']",
  "[data-cmp*='mile']",
  "[data-testid*='mileage']",
  "[data-testid*='odometer']",
  "[data-cmp='section'] span.no-wrap",
  "span.no-wrap",
  "li",
  "span"
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});
const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1
});

let modelPromise;
let modelApi;
let observer;
let throttleTimer = null;
let renderInFlight = false;
let lastUrl = location.href;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrice(text) {
  if (!text) {
    return null;
  }

  const dollarMatch = text.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?)/);
  if (dollarMatch) {
    return toNumber(dollarMatch[1].replace(/,/g, ""));
  }

  return null;
}

function parseYear(text) {
  if (!text) {
    return null;
  }

  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return toNumber(yearMatch[0]);
  }

  return null;
}

function parseMiles(text) {
  if (!text) {
    return null;
  }

  const normalized = cleanText(text);
  const lowered = normalized.toLowerCase();
  const matches = Array.from(
    lowered.matchAll(/([0-9][0-9,]*(?:\.\d+)?)\s*(?:mi|miles)\b/g)
  );

  if (matches.length === 0) {
    return null;
  }

  let bestCandidate = null;

  for (const match of matches) {
    const snippet = lowered.slice(match.index, match.index + 28);
    if (snippet.includes("away")) {
      continue;
    }

    const parsed = toNumber(match[1].replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      continue;
    }

    if (bestCandidate === null) {
      bestCandidate = parsed;
      continue;
    }

    const bestLooksLikeOdometer = bestCandidate >= 1000;
    const parsedLooksLikeOdometer = parsed >= 1000;

    if (
      (parsedLooksLikeOdometer && !bestLooksLikeOdometer) ||
      parsed > bestCandidate
    ) {
      bestCandidate = parsed;
    }
  }

  if (bestCandidate !== null) {
    return bestCandidate;
  }

  return null;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function readFirstParsed(selectors, parser, debugLog, keyName) {
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    let inspected = 0;
    for (const node of nodes) {
      inspected += 1;
      if (inspected > 30) {
        break;
      }

      const text = cleanText(node.textContent);
      const parsed = parser(text);
      if (parsed !== null) {
        debugLog.push(`${keyName}: ${parsed} (selector "${selector}")`);
        return parsed;
      }
    }
  }

  debugLog.push(`${keyName}: no selector match`);
  return null;
}

function walkJson(value, visitor) {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkJson(item, visitor);
    }
    return;
  }

  if (typeof value === "object") {
    visitor(value);
    for (const nested of Object.values(value)) {
      walkJson(nested, visitor);
    }
  }
}

function extractFromJsonLd(debugLog) {
  const scripts = document.querySelectorAll("script[type='application/ld+json']");
  let year = null;
  let miles = null;
  let price = null;

  for (const script of scripts) {
    let parsed;
    try {
      parsed = JSON.parse(script.textContent || "");
    } catch (error) {
      continue;
    }

    walkJson(parsed, (obj) => {
      if (year === null) {
        year =
          parseYear(cleanText(obj.vehicleModelDate)) ??
          parseYear(cleanText(obj.modelDate)) ??
          parseYear(cleanText(obj.name));
      }

      if (miles === null) {
        const rawMiles = obj.mileageFromOdometer;
        if (rawMiles && typeof rawMiles === "object") {
          miles = toNumber(rawMiles.value) ?? parseMiles(cleanText(rawMiles.value));
        } else {
          miles = toNumber(rawMiles) ?? parseMiles(cleanText(rawMiles));
        }
      }

      if (price === null) {
        const offers = obj.offers;
        if (offers && typeof offers === "object") {
          if (Array.isArray(offers)) {
            for (const offer of offers) {
              const offerPrice = toNumber(offer && offer.price);
              if (offerPrice !== null) {
                price = offerPrice;
                break;
              }
            }
          } else {
            price = toNumber(offers.price);
          }
        }

        if (price === null) {
          price = toNumber(obj.price) ?? parsePrice(cleanText(obj.price));
        }
      }
    });

    if (year !== null || miles !== null || price !== null) {
      break;
    }
  }

  if (year !== null || miles !== null || price !== null) {
    debugLog.push(
      `jsonld: year=${year ?? "?"}, miles=${miles ?? "?"}, price=${price ?? "?"}`
    );
  } else {
    debugLog.push("jsonld: no useful values");
  }

  return { year, miles, price };
}

function extractFromKnownVdpNodes(debugLog) {
  const year = readFirstParsed(YEAR_SELECTORS, parseYear, debugLog, "year");
  const miles = readFirstParsed(MILES_SELECTORS, parseMiles, debugLog, "miles");
  const price = readFirstParsed(PRICE_SELECTORS, parsePrice, debugLog, "price");

  return { year, miles, price };
}

function extractListingData() {
  const debugLog = [];
  const domData = extractFromKnownVdpNodes(debugLog);
  const jsonLdData = extractFromJsonLd(debugLog);

  let year = domData.year ?? jsonLdData.year;
  let miles = domData.miles ?? jsonLdData.miles;
  let price = domData.price ?? jsonLdData.price;

  if (year === null) {
    year = parseYear(cleanText(document.title));
    if (year !== null) {
      debugLog.push(`year: ${year} (title fallback)`);
    }
  }

  if (price === null || miles === null || year === null) {
    const bodyText = cleanText(document.body && document.body.innerText).slice(
      0,
      120000
    );
    if (year === null) {
      year = parseYear(bodyText);
      if (year !== null) {
        debugLog.push(`year: ${year} (body text fallback)`);
      }
    }
    if (miles === null) {
      miles = parseMiles(bodyText);
      if (miles !== null) {
        debugLog.push(`miles: ${miles} (body text fallback)`);
      }
    }
    if (price === null) {
      price = parsePrice(bodyText);
      if (price !== null) {
        debugLog.push(`price: ${price} (body text fallback)`);
      }
    }
  }

  debugLog.push(
    `final: year=${year ?? "missing"}, miles=${miles ?? "missing"}, price=${price ?? "missing"}`
  );
  return { year, miles, price, debugLog };
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return currencyFormatter.format(value);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${percentFormatter.format(value)}%`;
}

function badgeColor(label) {
  if (label === "GOOD") {
    return "#1f8f4d";
  }
  if (label === "OVERPRICED") {
    return "#c53929";
  }
  return "#8a6d1b";
}

function ensureOverlay() {
  let root = document.getElementById(OVERLAY_ID);
  if (!root) {
    root = document.createElement("section");
    root.id = OVERLAY_ID;
    root.style.position = "fixed";
    root.style.top = "14px";
    root.style.right = "14px";
    root.style.zIndex = "2147483647";
    root.style.background = "rgba(16, 20, 27, 0.96)";
    root.style.color = "#f4f7ff";
    root.style.width = "300px";
    root.style.maxWidth = "calc(100vw - 24px)";
    root.style.border = "1px solid rgba(121, 138, 179, 0.4)";
    root.style.borderRadius = "10px";
    root.style.padding = "10px 12px";
    root.style.fontFamily =
      "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
    root.style.fontSize = "13px";
    root.style.lineHeight = "1.35";
    root.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.35)";
    document.body.appendChild(root);
  }
  return root;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderOverlay({ cfg, listing, assessment }) {
  const root = ensureOverlay();
  const hasAllFields =
    Number.isFinite(listing.year) &&
    Number.isFinite(listing.miles) &&
    Number.isFinite(listing.price);

  if (!hasAllFields || !assessment || !Number.isFinite(assessment.expectedPrice)) {
    const debugBlock = cfg.debug
      ? `<pre style="margin:8px 0 0;white-space:pre-wrap;color:#bfd1ff;font-size:11px;">${escapeHtml(
          listing.debugLog.join("\n")
        )}</pre>`
      : "";
    root.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">AutoTrader Overlay</div>
      <div style="color:#ffd78a;">insufficient data</div>
      ${debugBlock}
    `;
    return;
  }

  const deltaPrefix = assessment.dealDelta > 0 ? "+" : "";
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div style="font-weight:700;">AutoTrader Overlay</div>
      <span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${badgeColor(
        assessment.label
      )};color:#fff;">${assessment.label}</span>
    </div>
    <div style="margin-top:6px;">Price: <strong>${formatCurrency(listing.price)}</strong></div>
    <div>Year: <strong>${formatNumber(listing.year)}</strong></div>
    <div>Miles: <strong>${formatNumber(listing.miles)}</strong></div>
    <hr style="border:none;border-top:1px solid rgba(121,138,179,0.35);margin:8px 0;" />
    <div>Expected price: <strong>${formatCurrency(assessment.expectedPrice)}</strong></div>
    <div>Deal delta: <strong>${deltaPrefix}${formatCurrency(
    assessment.dealDelta
  )}</strong> (${deltaPrefix}${formatPercent(assessment.dealDeltaPct)})</div>
    ${
      cfg.debug
        ? `<pre style="margin:8px 0 0;white-space:pre-wrap;color:#bfd1ff;font-size:11px;">${escapeHtml(
            listing.debugLog.join("\n")
          )}</pre>`
        : ""
    }
  `;
}

async function getModelApi() {
  if (modelApi) {
    return modelApi;
  }

  if (!modelPromise) {
    modelPromise = import(chrome.runtime.getURL("dealModel.js"));
  }

  modelApi = await modelPromise;
  return modelApi;
}

async function loadConfig() {
  return chrome.storage.sync.get(DEFAULT_CONFIG);
}

async function render(reason) {
  if (renderInFlight) {
    scheduleRender(`${reason}-queued`);
    return;
  }

  renderInFlight = true;
  try {
    const [cfg, model] = await Promise.all([loadConfig(), getModelApi()]);
    const listing = extractListingData();

    const hasRequiredData =
      Number.isFinite(listing.year) &&
      Number.isFinite(listing.miles) &&
      Number.isFinite(listing.price);

    const assessment = hasRequiredData
      ? model.dealAssessment(
          {
            year: listing.year,
            miles: listing.miles,
            price: listing.price
          },
          cfg
        )
      : null;

    renderOverlay({ cfg, listing, assessment });
  } catch (error) {
    const fallbackCfg = await loadConfig();
    renderOverlay({
      cfg: fallbackCfg,
      listing: {
        year: null,
        miles: null,
        price: null,
        debugLog: [`render error: ${String(error && error.message)}`]
      },
      assessment: null
    });
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
    void render(reason);
  }, RENDER_THROTTLE_MS);
}

function observePage() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    let shouldRender = false;
    for (const mutation of mutations) {
      const target =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (!target || !target.closest(`#${OVERLAY_ID}`)) {
        shouldRender = true;
        break;
      }
    }

    if (!shouldRender) {
      return;
    }

    if (location.href !== lastUrl) {
      lastUrl = location.href;
    }
    scheduleRender("mutation");
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
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

  window.addEventListener("popstate", () => scheduleRender("popstate"));
}

function attachStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    const watchedKeys = Object.keys(DEFAULT_CONFIG);
    for (const key of watchedKeys) {
      if (changes[key]) {
        scheduleRender(`storage:${key}`);
        return;
      }
    }
  });
}

function init() {
  observePage();
  attachNavigationHooks();
  attachStorageListener();
  scheduleRender("init");
}

init();
