export class SportEasyRequestError extends Error {
  constructor(message, { kind, endpoint, status = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "SportEasyRequestError";
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = status;
  }
}

function assertSafeRelativeEndpoint(endpoint) {
  if (
    typeof endpoint !== "string" ||
    !endpoint ||
    endpoint.startsWith("/") ||
    endpoint.includes("\\") ||
    endpoint.includes("..") ||
    /^[a-z][a-z\d+.-]*:/i.test(endpoint)
  ) {
    throw new SportEasyRequestError("Endpoint interne invalide.", {
      kind: "configuration",
      endpoint: "(invalide)",
    });
  }
}

const ALLOWED_API_VERSIONS = new Set(["2.1", "2.3"]);

function assertAllowedVersion(version) {
  if (!ALLOWED_API_VERSIONS.has(version)) {
    throw new SportEasyRequestError("Version interne de l'API non autorisée.", {
      kind: "configuration",
      endpoint: "(version invalide)",
    });
  }
}

function paginationEndpoint(apiBaseUrl, firstEndpoint, nextValue, version, proxyMode) {
  if (typeof nextValue !== "string" || nextValue.length === 0) {
    throw new SportEasyRequestError("Le lien de pagination SportEasy est invalide.", {
      kind: "invalid-response",
      endpoint: firstEndpoint,
    });
  }

  const firstUrl = proxyMode
    ? new URL(`/v${version}/${firstEndpoint}`, "https://api.sporteasy.net")
    : new URL(`v${version}/${firstEndpoint}`, apiBaseUrl);
  const nextUrl = new URL(nextValue, proxyMode ? "https://api.sporteasy.net" : apiBaseUrl);

  if (
    nextUrl.origin !== (proxyMode ? "https://api.sporteasy.net" : apiBaseUrl.origin) ||
    nextUrl.username ||
    nextUrl.password ||
    nextUrl.hash ||
    nextUrl.pathname !== firstUrl.pathname
  ) {
    throw new SportEasyRequestError(
      "SportEasy a renvoyé un lien de pagination vers une route inattendue.",
      { kind: "invalid-response", endpoint: firstEndpoint },
    );
  }

  const apiPrefix = `/v${version}/`;
  if (!nextUrl.pathname.startsWith(apiPrefix)) {
    throw new SportEasyRequestError("Le lien de pagination SportEasy est hors de l'API autorisée.", {
      kind: "invalid-response",
      endpoint: firstEndpoint,
    });
  }

  const relative = `${nextUrl.pathname.slice(apiPrefix.length)}${nextUrl.search}`;
  assertSafeRelativeEndpoint(relative);
  return relative;
}

export class ReadonlySportEasyClient {
  constructor({ apiBaseUrl, cookie, bearerToken = "", timeoutMs }) {
    this.apiBaseUrl = apiBaseUrl;
    this.cookie = cookie;
    this.bearerToken = bearerToken;
    this.timeoutMs = timeoutMs;
  }

  async getJson(endpoint, { version = "2.1" } = {}) {
    assertSafeRelativeEndpoint(endpoint);
    assertAllowedVersion(version);
    const url = new URL(`v${version}/${endpoint}`, this.apiBaseUrl);
    let response;

    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: this.bearerToken
          ? {Accept:"application/json", Authorization:`Bearer ${this.bearerToken}`}
          : {Accept:"application/json", Cookie:this.cookie},
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause?.name === "TimeoutError" || cause?.name === "AbortError";
      throw new SportEasyRequestError(
        timedOut ? `Délai réseau dépassé après ${this.timeoutMs} ms.` : "Accès réseau impossible.",
        { kind: "network", endpoint, cause },
      );
    }

    if (response.status >= 300 && response.status < 400) {
      throw new SportEasyRequestError("Session absente ou expirée (redirection reçue).", {
        kind: "authentication",
        endpoint,
        status: response.status,
      });
    }

    if (response.status === 401) {
      throw new SportEasyRequestError("Session SportEasy absente ou expirée.", {
        kind: "authentication",
        endpoint,
        status: response.status,
      });
    }

    if (response.status === 403) {
      throw new SportEasyRequestError("La session ne possède pas les droits nécessaires.", {
        kind: "authorization",
        endpoint,
        status: response.status,
      });
    }

    if (!response.ok) {
      throw new SportEasyRequestError(`SportEasy a retourné HTTP ${response.status}.`, {
        kind: "http",
        endpoint,
        status: response.status,
      });
    }

    const body = await response.text();
    try {
      return JSON.parse(body);
    } catch (cause) {
      throw new SportEasyRequestError("La réponse SportEasy n'est pas un JSON valide.", {
        kind: "invalid-response",
        endpoint,
        status: response.status,
        cause,
      });
    }
  }

  async getJsonCollection(endpoint, { maxPages = 100, version = "2.1" } = {}) {
    assertSafeRelativeEndpoint(endpoint);
    assertAllowedVersion(version);

    const items = [];
    const visited = new Set();
    let expectedCount = null;
    let nextEndpoint = endpoint;
    let pages = 0;

    while (nextEndpoint) {
      if (visited.has(nextEndpoint)) {
        throw new SportEasyRequestError("La pagination SportEasy tourne en boucle.", {
          kind: "invalid-response",
          endpoint,
        });
      }
      if (pages >= maxPages) {
        throw new SportEasyRequestError("La réponse SportEasy contient trop de pages.", {
          kind: "invalid-response",
          endpoint,
        });
      }

      visited.add(nextEndpoint);
      const payload = await this.getJson(nextEndpoint, { version });
      pages += 1;

      if (Array.isArray(payload)) {
        if (pages !== 1) {
          throw new SportEasyRequestError("Une page SportEasy a une structure inattendue.", {
            kind: "invalid-response",
            endpoint,
          });
        }
        items.push(...payload);
        nextEndpoint = null;
        continue;
      }

      if (!payload || typeof payload !== "object" || !Array.isArray(payload.results)) {
        throw new SportEasyRequestError(
          "La réponse SportEasy n'est ni une liste ni une collection paginée.",
          { kind: "invalid-response", endpoint },
        );
      }

      if (
        Object.hasOwn(payload, "count") &&
        (!Number.isInteger(payload.count) || payload.count < 0)
      ) {
        throw new SportEasyRequestError("Le total annoncé par SportEasy est invalide.", {
          kind: "invalid-response",
          endpoint,
        });
      }

      if (Number.isInteger(payload.count) && payload.count >= 0) {
        if (expectedCount !== null && expectedCount !== payload.count) {
          throw new SportEasyRequestError(
            "Le nombre total annoncé par SportEasy change entre deux pages.",
            { kind: "invalid-response", endpoint },
          );
        }
        expectedCount = payload.count;
      }

      if (payload.results.length === 0 && payload.next) {
        throw new SportEasyRequestError(
          "SportEasy annonce une page suivante après une page vide.",
          { kind: "invalid-response", endpoint },
        );
      }

      if (
        payload.next !== null &&
        payload.next !== undefined &&
        typeof payload.next !== "string"
      ) {
        throw new SportEasyRequestError("Le lien de page suivante SportEasy est invalide.", {
          kind: "invalid-response",
          endpoint,
        });
      }

      items.push(...payload.results);
      nextEndpoint = payload.next
        ? paginationEndpoint(this.apiBaseUrl, endpoint, payload.next, version, Boolean(this.bearerToken))
        : null;
    }

    if (expectedCount !== null && items.length !== expectedCount) {
      throw new SportEasyRequestError(
        "Réponse SportEasy partielle : " +
          `${items.length} élément(s) reçu(s) sur ${expectedCount} annoncé(s).`,
        { kind: "invalid-response", endpoint },
      );
    }

    return Object.freeze({
      items,
      count: expectedCount ?? items.length,
      pages,
    });
  }
}

export function printRequestError(error) {
  const endpoint = error?.endpoint || "non déterminé";
  const status = error?.status ?? "non disponible";
  const kind = error?.kind || "inattendue";

  console.error("Diagnostic SportEasy : échec");
  console.error(`- Type : ${kind}`);
  console.error(`- Code HTTP : ${status}`);
  console.error(`- Endpoint : GET ${endpoint}`);
  console.error(`- Message : ${error?.message || "Erreur inconnue."}`);
}
