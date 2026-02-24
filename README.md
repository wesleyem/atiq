# AutoTrader DealScore Overlay

Browser extension (Chromium + Firefox) that annotates AutoTrader search result cards with a computed **DealScore** and optionally removes non-target UI cards/modules.

## What It Does

- Adds a compact overlay badge to listing cards on AutoTrader search results pages (`/cars-for-sale`).
- Computes a **DealScore (0-100)** using:
  - AutoTrader/KBB card badge signal (`Great Price`, `Good Price`, or none).
  - Miles-for-year anomaly (`listingMiles` vs expected miles by age).
- Colors the badge by score thresholds:
  - Green for good deals (>= `goodDealScore`)
  - Red for poor deals (<= `poorDealScore`)
  - Neutral otherwise
- Supports infinite scroll / SPA updates with `MutationObserver` + throttled rescans.
- Lets you toggle hiding of noisy card types/modules directly from the options page.

## DealScore Model (Current)

Inputs:
- `kbbValue`: `Great Price=1.0`, `Good Price=0.5`, none=`0.0`
- `normalizedKbb = (kbbValue - 0.5) * 2`  -> `[-1, +1]`
- `ageYears = max(currentYear - listingYear, 0)`
- `expectedMiles = max(ageYears * milesPerYear, milesPerYear)`
- `deltaMiles = listingMiles - expectedMiles`
- `normalizedMiles = clamp(-deltaMiles / milesScale, -1, +1)`

Weighting:
- Raw weights from options are normalized to ratios:
  - `normKbbWeight = kbbWeight / (kbbWeight + milesWeight + epsilon)`
  - `normMilesWeight = milesWeight / (kbbWeight + milesWeight + epsilon)`

Final score:
- `combined = normKbbWeight * normalizedKbb + normMilesWeight * normalizedMiles`
- `scaled = (combined + 1) / 2`
- `DealScore = clamp(round(scaled * 100), 0, 100)`

## Options

All settings are stored in the extension `storage.sync` area.

### Scoring Parameters

- `milesPerYear` (default: `12000`)
- `milesScale` (default: `20000`)
- `kbbWeight` (default: `12`)
- `milesWeight` (default: `10`)
- `goodDealScore` (default: `70`)
- `poorDealScore` (default: `40`)
- `debug` (default: `false`)

### Hidden Card Toggles

- `hideSponsoredCards` (default: `true`)
- `hideSuggestedCards` (default: `true`)
- `hideAdModules` (default: `true`)
- `hideInlineFilterCarousel` (default: `true`)
- `hideMyWalletCard` (default: `true`)
- `hidePreorderCards` (default: `true`)

`hidePreorderCards` currently targets:
- `div.display-flex.fade-in`
- with an **immediate child** matching `[data-cmp="preorderCard"]`

## Installation (Local / Unpacked)

1. Clone this repo.
2. For Chromium/Chrome:
   - Open `chrome://extensions`.
   - Enable **Developer mode**.
   - Click **Load unpacked** and select `src/`.
3. For Firefox:
   - Open `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on...**.
   - Select `src/manifest.json`.

## Build (Local ZIPs)

Run:

```bash
npm run build
```

This creates:

- `dist/chromium-extension-v<manifest-version>.zip`
- `dist/firefox-extension-v<manifest-version>.zip`

To override the tag in filenames:

```bash
npm run build -- v1.3.1
```

## Usage

1. Open AutoTrader search results (`https://www.autotrader.com/cars-for-sale/...`).
2. Each eligible listing card gets a badge like:
   - `DealScore: 74`
   - `KBB: Great|Good|—`
   - `Miles: +/-Xk vs exp`
3. Open extension popup -> **Open Options** to tune scoring and hide/show specific module types.

## Project Structure

- `src/manifest.json` - MV3 manifest
- `src/contentScript.js` - extraction, scoring, overlays, removals, observers
- `src/options.html` / `src/options.js` - config UI + persistence
- `src/popup.html` / `src/popup.js` - quick entry to options page
- `package.json` - local/CI automation scripts
- `scripts/build-extensions.sh` - local ZIP build script
- `.github/workflows/release-extension.yml` - release workflow and ZIP packaging

## Release Workflow

On pushes to `main` (or manual dispatch), GitHub Actions runs `release-please` and, when a release is created, packages `src/` into:

- `dist/chromium-extension-<tag>.zip`
- `dist/firefox-extension-<tag>.zip`

Then uploads both ZIPs to the GitHub Release.

## Limitations

- DOM-only approach; no network/API scraping.
- Operates on search results cards, not individual vehicle detail pages.
- Selector logic may require updates if AutoTrader changes markup.

## License

See `LICENSE`.
