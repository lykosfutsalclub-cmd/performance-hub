import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLICATION_FILES = Object.freeze([
  "player-secondary-data.js",
  "team-data.js",
  "pantheon-data.js",
]);

const GENERATED_AT_PATTERN = /(\"generatedAt\"\s*:\s*)\"([^\"]+)\"/g;

export function neutralizeGeneratedAt(text) {
  return text.replace(GENERATED_AT_PATTERN, '$1"<horodatage>"');
}

function generatedAtValues(text, file) {
  const values = [...text.matchAll(GENERATED_AT_PATTERN)].map((match) => {
    const timestamp = Date.parse(match[2]);
    if (!Number.isFinite(timestamp)) {
      throw new Error(`Horodatage generatedAt invalide dans ${file}.`);
    }
    return timestamp;
  });
  if (values.length === 0) throw new Error(`Horodatage generatedAt absent de ${file}.`);
  return values;
}

function assertCompleteSet(label, files) {
  for (const file of PUBLICATION_FILES) {
    if (typeof files?.[file] !== "string") {
      throw new Error(`Lot ${label} incomplet : ${file} est absent.`);
    }
  }
}

/**
 * Choisit le seul lot qu'une exécution concurrente peut publier sans écraser
 * des données plus récentes.
 *
 * - aucune donnée distante modifiée depuis le départ : le lot validé gagne ;
 * - les trois fichiers distants portent le même contenu métier, avec des
 *   horodatages au moins aussi récents : le lot distant gagne ;
 * - toute mise à jour partielle ou divergente est refusée.
 */
export function selectPublicationSet(base, validated, current) {
  assertCompleteSet("de départ", base);
  assertCompleteSet("validé", validated);
  assertCompleteSet("public courant", current);

  const changedFiles = PUBLICATION_FILES.filter((file) => current[file] !== base[file]);
  if (changedFiles.length === 0) return "validated";

  if (changedFiles.length !== PUBLICATION_FILES.length) {
    throw new Error(
      `Publication concurrente partielle détectée (${changedFiles.join(", ")}). Aucun fichier ne sera écrasé.`,
    );
  }

  for (const file of PUBLICATION_FILES) {
    if (neutralizeGeneratedAt(current[file]) !== neutralizeGeneratedAt(validated[file])) {
      throw new Error(`Publication concurrente divergente détectée dans ${file}. Aucun fichier ne sera écrasé.`);
    }

    const currentDates = generatedAtValues(current[file], file);
    const validatedDates = generatedAtValues(validated[file], file);
    if (currentDates.length !== validatedDates.length) {
      throw new Error(`Structure generatedAt divergente dans ${file}. Aucun fichier ne sera écrasé.`);
    }
    if (currentDates.some((timestamp, index) => timestamp < validatedDates[index])) {
      throw new Error(`Le lot concurrent est plus ancien dans ${file}. Aucun fichier ne sera écrasé.`);
    }
  }

  return "current";
}

async function readPublicationSet(directory) {
  return Object.fromEntries(await Promise.all(PUBLICATION_FILES.map(async (file) => [
    file,
    await readFile(path.join(directory, file), "utf8"),
  ])));
}

async function main() {
  const [baseDirectory, validatedDirectory, currentDirectory] = process.argv.slice(2);
  if (!baseDirectory || !validatedDirectory || !currentDirectory) {
    throw new Error("Usage : publication-selection.mjs <départ> <validé> <public-courant>");
  }
  const decision = selectPublicationSet(
    await readPublicationSet(baseDirectory),
    await readPublicationSet(validatedDirectory),
    await readPublicationSet(currentDirectory),
  );
  process.stdout.write(`${decision}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
