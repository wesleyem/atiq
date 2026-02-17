export const DEFAULT_DEAL_CONFIG = Object.freeze({
  anchorYear: 2017,
  anchorMiles: 100000,
  anchorPrice: 45000,
  dollarsPerMile: 0.15,
  dollarsPerYear: 1500,
  goodDealThresholdDollars: 2000,
  badDealThresholdDollars: -2000
});

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedConfig(cfg = {}) {
  return {
    anchorYear: toNumber(cfg.anchorYear, DEFAULT_DEAL_CONFIG.anchorYear),
    anchorMiles: toNumber(cfg.anchorMiles, DEFAULT_DEAL_CONFIG.anchorMiles),
    anchorPrice: toNumber(cfg.anchorPrice, DEFAULT_DEAL_CONFIG.anchorPrice),
    dollarsPerMile: toNumber(
      cfg.dollarsPerMile,
      DEFAULT_DEAL_CONFIG.dollarsPerMile
    ),
    dollarsPerYear: toNumber(
      cfg.dollarsPerYear,
      DEFAULT_DEAL_CONFIG.dollarsPerYear
    ),
    goodDealThresholdDollars: toNumber(
      cfg.goodDealThresholdDollars,
      DEFAULT_DEAL_CONFIG.goodDealThresholdDollars
    ),
    badDealThresholdDollars: toNumber(
      cfg.badDealThresholdDollars,
      DEFAULT_DEAL_CONFIG.badDealThresholdDollars
    )
  };
}

export function expectedPrice({ year, miles }, cfg = {}) {
  const c = normalizedConfig(cfg);
  const yearNumber = Number(year);
  const milesNumber = Number(miles);

  if (!Number.isFinite(yearNumber) || !Number.isFinite(milesNumber)) {
    return Number.NaN;
  }

  const yearAdjustment = (yearNumber - c.anchorYear) * c.dollarsPerYear;
  const mileAdjustment = (c.anchorMiles - milesNumber) * c.dollarsPerMile;
  return c.anchorPrice + yearAdjustment + mileAdjustment;
}

export function dealAssessment({ year, miles, price }, cfg = {}) {
  const c = normalizedConfig(cfg);
  const expected = expectedPrice({ year, miles }, c);
  const priceNumber = Number(price);

  if (!Number.isFinite(expected) || !Number.isFinite(priceNumber)) {
    return {
      expectedPrice: Number.NaN,
      dealDelta: Number.NaN,
      dealDeltaPct: Number.NaN,
      label: "FAIR"
    };
  }

  const dealDelta = expected - priceNumber;
  const dealDeltaPct = expected === 0 ? 0 : (dealDelta / expected) * 100;

  let label = "FAIR";
  if (dealDelta >= c.goodDealThresholdDollars) {
    label = "GOOD";
  } else if (dealDelta <= c.badDealThresholdDollars) {
    label = "OVERPRICED";
  }

  return {
    expectedPrice: expected,
    dealDelta,
    dealDeltaPct,
    label
  };
}
