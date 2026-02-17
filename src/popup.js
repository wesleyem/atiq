const openOptionsButton = document.getElementById("open-options");

if (openOptionsButton) {
  openOptionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

console.log("AutoTrader DealScore Overlay popup loaded.");
