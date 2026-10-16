import { defineConfig } from "vite";
import { cpSync } from "node:fs";

// Files are loaded at runtime via import.meta.resolve("../assets/..."), which Vite
// doesn't bundle, so copy the assets folder into the build as-is.
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "copy-assets",
      apply: "build",
      closeBundle() {
        cpSync("assets", "dist/assets", {
          recursive: true,
          filter: (src) => !src.includes("private") && !src.endsWith(".DS_Store"),
        });
      },
    },
  ],
});
