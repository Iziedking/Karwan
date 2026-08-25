import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const roots = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));

if (roots.length === 0) {
  console.error("Usage: node ../scripts/run-tests.mjs <root> [...roots] [--concurrency=N]");
  process.exit(2);
}

function collectTests(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTests(absolute));
    } else if (/\.test\.(?:ts|tsx|mts|cts)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

const testFiles = roots
  .flatMap((root) => {
    const absolute = path.resolve(cwd, root);
    return statSync(absolute).isDirectory() ? collectTests(absolute) : [absolute];
  })
  .sort()
  .map((file) => path.relative(cwd, file));

if (testFiles.length === 0) {
  console.error(`No test files found under: ${roots.join(", ")}`);
  process.exit(1);
}

const tsxBin = path.resolve(
  cwd,
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const args = ["--test"];
if (concurrencyArg) args.push("--test-concurrency", concurrencyArg.slice("--concurrency=".length));
args.push(...testFiles);

const result = spawnSync(tsxBin, args, {
  cwd,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
