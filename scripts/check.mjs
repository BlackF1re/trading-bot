import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "test", "scripts", "web"].filter(existsSync);
const files = roots
  .flatMap(walk)
  .filter((file) => file.endsWith(".mjs") || file.endsWith(".js"));
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Syntax check passed (${files.length} files).`);

function walk(root) {
  return readdirSync(root).flatMap((entry) => {
    const full = join(root, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
