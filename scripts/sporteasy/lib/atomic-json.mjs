import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeJsonAtomically(file, data) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporaryFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryFile, file);
}
