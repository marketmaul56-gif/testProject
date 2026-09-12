import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const violations = [];
const forbiddenInDomain = ["@nestjs/", "@prisma/", "prisma/", "bullmq", "openai"];
const forbiddenWeb = ["packages/platform/db", "@prisma/", "prisma/"];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const required of ["packages/modules", "prisma", "docs/locked"]) {
  try {
    if (!(await stat(join(root, required))).isDirectory()) violations.push(`missing directory: ${required}`);
  } catch {
    violations.push(`missing directory: ${required}`);
  }
}

for (const file of await walk(join(root, "packages"))) {
  const rel = relative(root, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");
  if (rel.includes("/src/domain/")) {
    for (const token of forbiddenInDomain) {
      if (source.includes(token)) violations.push(`${rel}: domain imports forbidden dependency '${token}'`);
    }
  }
}

try {
  for (const file of await walk(join(root, "apps/web"))) {
    const rel = relative(root, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");
    for (const token of forbiddenWeb) {
      if (source.includes(token)) violations.push(`${rel}: web imports forbidden dependency '${token}'`);
    }
  }
} catch {
  // web runtime is introduced in M12.4; absence is allowed during M12.2.
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Architecture dependency checks passed.");
