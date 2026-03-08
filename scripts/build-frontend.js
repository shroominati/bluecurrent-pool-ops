const fs = require("fs");
const path = require("path");

const srcDir = path.join(process.cwd(), "public");
const outDir = path.join(process.cwd(), "dist");
const apiBase =
  process.env.POOL_OPS_API_BASE || process.env.WRECK_API_BASE || process.env.REVEAL_API_BASE || "";

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  fs.copyFileSync(src, dest);
}

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });
copyRecursive(srcDir, outDir);

const runtimeConfig = `window.POOL_OPS_API_BASE = ${JSON.stringify(
  apiBase,
)};\nwindow.WRECK_API_BASE = window.WRECK_API_BASE || window.POOL_OPS_API_BASE;\nwindow.REVEAL_API_BASE = window.REVEAL_API_BASE || window.POOL_OPS_API_BASE;\n`;
fs.writeFileSync(path.join(outDir, "runtime-config.js"), runtimeConfig);
console.log("Built frontend to dist/");
console.log(`Injected POOL_OPS_API_BASE=${apiBase || "(same-origin)"}`);
