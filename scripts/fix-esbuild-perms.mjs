// esbuild's own postinstall (which normally chmods its native binary +x) is
// declined in pnpm-workspace.yaml because it fails to *execute* the binary
// for a version check in Hostinger's build sandbox. That decline means the
// chmod never happens either, so the binary is later spawned without the
// executable bit set. Set it ourselves, for every platform binary present.
import { readdirSync, statSync, chmodSync } from "fs";
import { join } from "path";

function walk(dir, depth) {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1);
    } else if (entry.isFile() && entry.name === "esbuild" && dir.split(/[\\/]/).pop() === "bin") {
      try {
        chmodSync(full, 0o755);
        console.log(`[fix-esbuild-perms] chmod +x ${full}`);
      } catch {
        // not supported on this platform (e.g. Windows) — fine
      }
    }
  }
}

walk("node_modules/.pnpm", 0);
