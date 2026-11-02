// Copies CesiumJS's prebuilt bundle and static assets (workers, textures, widgets CSS) into
// public/cesium so the Virtual Window can load them as plain files. Runs on `npm install`.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(web, "node_modules", "cesium", "Build", "Cesium");
const dest = join(web, "public", "cesium");

if (!existsSync(src)) {
  console.warn("[copy-cesium] cesium not installed, skipping");
} else {
  rmSync(dest, { recursive: true, force: true });
  for (const part of ["Cesium.js", "Workers", "ThirdParty", "Assets", "Widgets"]) {
    cpSync(join(src, part), join(dest, part), { recursive: true });
  }
  console.log("[copy-cesium] copied CesiumJS to public/cesium");
}
