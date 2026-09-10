(() => {
  const API = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let sessionToken = "";

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "heure indisponible" : date.toLocaleString("fr-FR", {dateStyle:"medium", timeStyle:"short"});
  }

  function removeReport() {
    document.getElementById("lykos-esupport-report")?.remove();
  }

  function renderReport(report) {
    removeReport();
    const card = document.createElement("aside");
    card.id = "lykos-esupport-report";
    card.className = `lykos-esupport-report is-${report.status || "pending"}`;
    card.setAttribute("aria-live", "polite");
    card.innerHTML = `
      <div class="lykos-esupport-report__icon" aria-hidden="true">🧭</div>
      <div>
        <small>OSCAR · RAPPORT eSUPPORT</small>
        <strong>${report.status === "operational" ? "Opérationnel" : report.status === "blocked" ? "Bloqué" : "À surveiller"}</strong>
        <p></p>
        <time></time>
      </div>`;
    card.querySelector("p").textContent = report.summary || "Le premier contrôle automatique est en attente.";
    card.querySelector("time").textContent = `Dernier contrôle : ${formatDate(report.checkedAt)}`;
    document.body.append(card);
  }

  async function loadReport(token) {
    sessionToken = token;
    try {
      const response = await originalFetch(`${API}/esupport`, {cache:"no-store", credentials:"omit", headers:{Authorization:`Bearer ${token}`}});
      if (response.status === 401) { sessionToken = ""; removeReport(); return; }
      if (!response.ok) throw new Error("report_unavailable");
      renderReport(await response.json());
    } catch {
      renderReport({status:"pending", summary:"Le rapport automatique eSupport est momentanément indisponible."});
    }
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (url === `${API}/session` && response.ok) {
      response.clone().json().then(payload => {
        if (typeof payload.token === "string") loadReport(payload.token);
      }).catch(() => {});
    }
    return response;
  };

  new MutationObserver(() => {
    if (sessionToken && document.body.textContent.includes("Code d’accès")) {
      sessionToken = "";
      removeReport();
    }
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
