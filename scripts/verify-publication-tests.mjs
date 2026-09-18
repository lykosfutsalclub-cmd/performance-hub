import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const minimumTests = 54;
const testFiles = (await readdir(new URL("../test/", import.meta.url)))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => fileURLToPath(new URL(`../test/${name}`, import.meta.url)));

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  encoding: "utf8",
  env: process.env,
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const output = `${result.stdout || ""}\n${result.stderr || ""}`;
const count = [...output.matchAll(/(?:^|\n)(?:#\s*)?(?:ℹ\s*)?tests\s+(\d+)/g)]
  .map((match) => Number(match[1]))
  .find(Number.isFinite);
if (!Number.isInteger(count)) throw new Error("Le nombre de tests exécutés n’a pas pu être vérifié.");
if (count < minimumTests) throw new Error(`Publication refusée : ${count} tests exécutés, minimum requis ${minimumTests}.`);
console.log(`Porte de publication validée : ${count} tests réussis (minimum ${minimumTests}).`);
