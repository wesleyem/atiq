const openOptionsButton = document.getElementById("open-options");
const extensionApi = globalThis.browser ?? globalThis.chrome;

if (openOptionsButton) {
  openOptionsButton.addEventListener("click", () => {
    extensionApi.runtime.openOptionsPage();
  });
}

console.log("AutoTrader DealScore Overlay popup loaded.");
