(() => {
  "use strict";

  const THRESHOLD = 78;
  const MAX_DISTANCE = 122;
  const LOADING_MESSAGE = "Aaaooouuuuuuuu 🐺(ça charge, sois patient…)";
  const excludedTargets = "input, textarea, select, [role='dialog'], .lykos-score-match-list, .match-progress, [data-no-pull-refresh]";
  const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;

  const indicator = document.createElement("div");
  indicator.className = "lykos-pull-refresh";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.setAttribute("aria-hidden", "true");
  indicator.textContent = "Tire vers le bas pour actualiser";
  document.body.append(indicator);

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "lykos-refresh-button";
  refreshButton.setAttribute("aria-label", "Actualiser les informations et les données");
  refreshButton.title = "Actualiser les informations et les données";
  refreshButton.textContent = "🔄";
  document.body.append(refreshButton);

  let startX = 0;
  let startY = 0;
  let distance = 0;
  let tracking = false;
  let armed = false;
  let refreshing = false;

  const pageIsAtTop = () => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop) <= 0;

  function reset() {
    tracking = false;
    armed = false;
    distance = 0;
    indicator.classList.remove("is-visible", "is-armed");
    indicator.style.setProperty("--pull-distance", "0px");
    indicator.setAttribute("aria-hidden", "true");
    indicator.textContent = "Tire vers le bas pour actualiser";
    document.documentElement.classList.remove("lykos-pull-active");
  }

  function beginRefresh() {
    if (refreshing) return;
    refreshing = true;
    tracking = false;
    indicator.classList.remove("is-armed");
    indicator.classList.add("is-visible", "is-refreshing");
    indicator.removeAttribute("aria-hidden");
    indicator.textContent = LOADING_MESSAGE;
    refreshButton.disabled = true;
    refreshButton.classList.add("is-refreshing");
    document.documentElement.classList.add("lykos-pull-active");
    window.dispatchEvent(new CustomEvent("lykos:pull-refresh"));
    window.setTimeout(() => window.location.reload(), 650);
  }

  refreshButton.addEventListener("click", () => {
    if (document.documentElement.classList.contains("lykos-access-locked")) return;
    beginRefresh();
  });

  if (touchDevice) document.addEventListener("touchstart", event => {
    if (
      refreshing
      || document.documentElement.classList.contains("lykos-access-locked")
      || event.touches.length !== 1
      || !pageIsAtTop()
      || event.target.closest?.(excludedTargets)
    ) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    distance = 0;
    tracking = true;
    armed = false;
  }, {passive:true});

  if (touchDevice) document.addEventListener("touchmove", event => {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    const deltaX = event.touches[0].clientX - startX;
    const deltaY = event.touches[0].clientY - startY;
    if (deltaY <= 0 || Math.abs(deltaX) > deltaY || !pageIsAtTop()) { reset(); return; }
    distance = Math.min(MAX_DISTANCE, deltaY * .56);
    if (distance < 7) return;
    event.preventDefault();
    armed = distance >= THRESHOLD;
    indicator.style.setProperty("--pull-distance", `${distance}px`);
    indicator.classList.add("is-visible");
    indicator.classList.toggle("is-armed", armed);
    indicator.removeAttribute("aria-hidden");
    indicator.textContent = armed ? "Relâche pour actualiser" : "Tire encore pour actualiser";
    document.documentElement.classList.add("lykos-pull-active");
  }, {passive:false});

  if (touchDevice) document.addEventListener("touchend", () => {
    if (!tracking || refreshing) return;
    if (armed) beginRefresh();
    else reset();
  }, {passive:true});

  if (touchDevice) document.addEventListener("touchcancel", reset, {passive:true});
  window.addEventListener("pageshow", () => {
    refreshing = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-refreshing");
    indicator.classList.remove("is-refreshing");
    reset();
  });
})();
