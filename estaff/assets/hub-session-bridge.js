(() => {
  "use strict";
  const API = "https://lykos-estaff-service.lykosfutsalclub.workers.dev/api/estaff";
  const nativeFetch = window.fetch.bind(window);
  let hubSession = window.LYKOS_HUB_ACCESS?.getSession?.() || null;
  let submitted = false;

  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init.method || (typeof input === "object" ? input?.method : "GET") || "GET").toUpperCase();
    if (hubSession?.token && url === `${API}/session` && method === "POST") {
      return Promise.resolve(new Response(JSON.stringify(hubSession), {
        status:200,
        headers:{"Content-Type":"application/json", "Cache-Control":"no-store"},
      }));
    }
    return nativeFetch(input, init);
  };

  function openLegacyInterface() {
    if (!hubSession?.token || submitted) return;
    const keypad = document.querySelector('#estaff-root [aria-label="Clavier numérique"]');
    const form = keypad?.closest("form");
    if (!keypad || !form) return;
    const digit = [...keypad.querySelectorAll("button")].find(button => button.textContent.trim() === "1");
    if (!digit) return;
    submitted = true;
    digit.click(); digit.click(); digit.click(); digit.click();
    requestAnimationFrame(() => form.requestSubmit());
  }

  window.addEventListener("lykos:hub-session", event => {
    hubSession = typeof event.detail?.token === "string" ? event.detail : null;
    submitted = false;
    openLegacyInterface();
  });

  window.addEventListener("lykos:estaff-cloud-session", event => {
    if (event.detail?.token === "" && hubSession?.token) window.LYKOS_HUB_ACCESS?.logout?.();
  });

  new MutationObserver(openLegacyInterface).observe(document.documentElement, {childList:true, subtree:true});
  openLegacyInterface();
})();
