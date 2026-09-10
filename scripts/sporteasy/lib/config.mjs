const PRODUCTION_API_ORIGIN = "https://api.sporteasy.net";
const ESUPPORT_PROXY_URL = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff/worker/sporteasy-read/";

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
    this.kind = "configuration";
  }
}

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigurationError(`Variable obligatoire absente : ${name}.`);
  }
  return value;
}

function readApiBaseUrl(proxyToken) {
  const rawValue = process.env.SPORTEASY_API_BASE_URL?.trim() || (proxyToken ? ESUPPORT_PROXY_URL : `${PRODUCTION_API_ORIGIN}/`);
  let parsed;

  try {
    parsed = new URL(rawValue);
  } catch {
    throw new ConfigurationError("SPORTEASY_API_BASE_URL n'est pas une URL valide.");
  }

  const expectedUrl = proxyToken ? ESUPPORT_PROXY_URL : `${PRODUCTION_API_ORIGIN}/`;
  if (
    parsed.href !== expectedUrl ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new ConfigurationError(
      `SPORTEASY_API_BASE_URL doit être exactement ${expectedUrl}.`,
    );
  }

  return parsed;
}

function readTeamId() {
  const value = requireEnvironmentVariable("SPORTEASY_TEAM_ID");
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ConfigurationError("SPORTEASY_TEAM_ID doit être un entier positif.");
  }
  return value;
}

function readCookie() {
  const value = requireEnvironmentVariable("SPORTEASY_COOKIE");
  if (/[\r\n]/.test(value)) {
    throw new ConfigurationError("SPORTEASY_COOKIE contient des caractères interdits.");
  }
  return value;
}

function readProxyToken() {
  const value = process.env.SPORTEASY_PROXY_TOKEN?.trim() || "";
  if (value && (!value.includes(".") || /[\r\n]/.test(value) || value.length > 5000)) {
    throw new ConfigurationError("SPORTEASY_PROXY_TOKEN est invalide.");
  }
  return value;
}

function readTimeout() {
  const rawValue = process.env.SPORTEASY_REQUEST_TIMEOUT_MS?.trim() || "15000";
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1000 || value > 120000) {
    throw new ConfigurationError(
      "SPORTEASY_REQUEST_TIMEOUT_MS doit être un entier compris entre 1000 et 120000.",
    );
  }
  return value;
}

export function readConfiguration() {
  const bearerToken = readProxyToken();
  return Object.freeze({
    apiBaseUrl: readApiBaseUrl(bearerToken),
    cookie: bearerToken ? "" : readCookie(),
    bearerToken,
    teamId: readTeamId(),
    timeoutMs: readTimeout(),
  });
}
