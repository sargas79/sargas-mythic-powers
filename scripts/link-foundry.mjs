/**
 * Links this repository into the local Foundry Data/modules folder for testing.
 * Usage: npm run link [-- <FoundryDataPath>]   (default: %LOCALAPPDATA%/FoundryVTT/Data)
 * Uses a directory junction on Windows, so no admin rights are needed.
 */
import { existsSync, lstatSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const id = "sargas-mythic-powers";
const dataPath =
  process.argv[2] ??
  (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "FoundryVTT", "Data") : undefined);
if (!dataPath) {
  console.error("Pass the Foundry Data path: npm run link -- <path>");
  process.exit(1);
}
const target = join(dataPath, "modules", id);
const source = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) {
  console.log(`${target} already exists. Remove it first to relink.`);
  process.exit(0);
}
symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
console.log(`Linked ${target} -> ${source}`);
