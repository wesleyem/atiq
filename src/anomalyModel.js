export const DEFAULT_ANOMALY_CONFIG = Object.freeze({
  milesPerYear: 12000,
  anomalyGoodMiles: -15000,
  anomalyBadMiles: 15000
});

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedConfig(cfg = {}) {
  return {
    milesPerYear: toNumber(cfg.milesPerYear, DEFAULT_ANOMALY_CONFIG.milesPerYear),
    anomalyGoodMiles: toNumber(
      cfg.anomalyGoodMiles,
      DEFAULT_ANOMALY_CONFIG.anomalyGoodMiles
    ),
    anomalyBadMiles: toNumber(
      cfg.anomalyBadMiles,
      DEFAULT_ANOMALY_CONFIG.anomalyBadMiles
    )
  };
}

export function computeMilesAnomaly(listingYear, listingMiles, cfg = {}) {
  const year = Number(listingYear);
  const miles = Number(listingMiles);

  if (!Number.isFinite(year) || !Number.isFinite(miles)) {
    return null;
  }

  const c = normalizedConfig(cfg);
  const currentYear = new Date().getFullYear();
  const rawAgeYears = currentYear - year;
  const ageYears = rawAgeYears > 0 ? rawAgeYears : 0;
  const expectedMiles = ageYears > 0 ? ageYears * c.milesPerYear : c.milesPerYear;

  if (!Number.isFinite(expectedMiles)) {
    return null;
  }

  const anomalyMiles = miles - expectedMiles;
  const anomalyPct = anomalyMiles / Math.max(expectedMiles, 1);

  let label = "NORMAL";
  if (anomalyMiles <= c.anomalyGoodMiles) {
    label = "LOW";
  } else if (anomalyMiles >= c.anomalyBadMiles) {
    label = "HIGH";
  }

  return {
    ageYears,
    expectedMiles,
    anomalyMiles,
    anomalyPct,
    label
  };
}
