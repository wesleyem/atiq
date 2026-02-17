const OVERLAY_ID = "autotrader-overlay-box";

function formatApr(apr) {
  if (apr === null || apr === undefined || apr === "") {
    return "not set";
  }

  const numericApr = Number(apr);
  if (!Number.isFinite(numericApr)) {
    return "not set";
  }

  return `${numericApr}%`;
}

function injectOverlay(aprText) {
  if (document.getElementById(OVERLAY_ID)) {
    return;
  }

  const container = document.createElement("div");
  container.id = OVERLAY_ID;
  container.style.position = "fixed";
  container.style.top = "12px";
  container.style.right = "12px";
  container.style.zIndex = "2147483647";
  container.style.background = "#111";
  container.style.color = "#fff";
  container.style.padding = "10px 12px";
  container.style.borderRadius = "8px";
  container.style.fontFamily = "Arial, sans-serif";
  container.style.fontSize = "13px";
  container.style.lineHeight = "1.4";
  container.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.25)";

  const title = document.createElement("div");
  title.textContent = "AutoTrader Overlay";
  title.style.fontWeight = "700";
  title.style.marginBottom = "4px";

  const aprLine = document.createElement("div");
  aprLine.textContent = `APR: ${aprText}`;

  container.appendChild(title);
  container.appendChild(aprLine);
  document.body.appendChild(container);
}

async function init() {
  try {
    const { apr } = await chrome.storage.sync.get(["apr"]);
    injectOverlay(formatApr(apr));
  } catch (error) {
    injectOverlay("not set");
    console.error("Failed to load extension config:", error);
  }
}

init();
