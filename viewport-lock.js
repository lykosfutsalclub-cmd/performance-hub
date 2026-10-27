(() => {
  "use strict";

  const preventZoom = (event) => event.preventDefault();
  const zoomKeys = new Set(["+", "-", "=", "0"]);
  let lastTouchEnd = 0;

  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, preventZoom, { passive: false });
  });

  document.addEventListener("touchmove", (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener("dblclick", preventZoom, { passive: false });

  document.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, { passive: false });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && zoomKeys.has(event.key)) {
      event.preventDefault();
    }
  }, { capture: true });
})();
