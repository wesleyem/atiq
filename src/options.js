const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const taxRateInput = document.getElementById("taxRate");
const aprInput = document.getElementById("apr");
const downPaymentInput = document.getElementById("downPayment");
const termMonthsInput = document.getElementById("termMonths");

function toNumberOrNull(value) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntegerOrNull(value) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function restoreOptions() {
  const stored = await chrome.storage.sync.get([
    "taxRate",
    "apr",
    "downPayment",
    "termMonths"
  ]);

  if (stored.taxRate !== null && stored.taxRate !== undefined) {
    taxRateInput.value = stored.taxRate;
  }
  if (stored.apr !== null && stored.apr !== undefined) {
    aprInput.value = stored.apr;
  }
  if (stored.downPayment !== null && stored.downPayment !== undefined) {
    downPaymentInput.value = stored.downPayment;
  }
  if (stored.termMonths !== null && stored.termMonths !== undefined) {
    termMonthsInput.value = stored.termMonths;
  }
}

async function saveOptions(event) {
  event.preventDefault();

  const payload = {
    taxRate: toNumberOrNull(taxRateInput.value),
    apr: toNumberOrNull(aprInput.value),
    downPayment: toNumberOrNull(downPaymentInput.value),
    termMonths: toIntegerOrNull(termMonthsInput.value)
  };

  await chrome.storage.sync.set(payload);
  statusEl.textContent = "Saved.";
}

form.addEventListener("submit", saveOptions);
restoreOptions();
