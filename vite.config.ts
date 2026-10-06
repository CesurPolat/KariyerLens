import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { EnvironmentOptions, Plugin } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));

function extensionAssets(): Plugin {
  return {
    name: "kariyerlens-extension-assets",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    async buildStart() {
      this.addWatchFile(fileURLToPath(new URL("manifest.json", import.meta.url)));
      const manifestText = await readFile(new URL("manifest.json", import.meta.url), "utf8");
      const manifest = JSON.parse(manifestText) as {
        icons: Record<string, string>;
        action: { default_icon: Record<string, string> };
      };
      this.emitFile({ type: "asset", fileName: "manifest.json", source: manifestText });
      for (const file of new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)])) {
        const url = new URL(file, import.meta.url);
        this.addWatchFile(fileURLToPath(url));
        this.emitFile({ type: "asset", fileName: file, source: await readFile(url) });
      }
    },
  };
}

function scriptEnvironment(entry: string, format: "es" | "iife", classicScope = false): EnvironmentOptions {
  return {
    consumer: "client",
    build: {
      emptyOutDir: false,
      rolldownOptions: {
        input: fileURLToPath(new URL(entry, import.meta.url)),
        // The first classic script shares navigation helpers with later scripts.
        // Keep its declarations and names until these are migrated to modules.
        treeshake: classicScope ? false : undefined,
        output: {
          format,
          entryFileNames: entry.replace(/\.ts$/, ".js"),
          codeSplitting: false,
        },
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  root,
  base: "./",
  publicDir: false,
  plugins: [extensionAssets()],
  builder: {},
  build: {
    outDir: "dist",
    target: "chrome114",
    sourcemap: mode === "development",
    minify: false,
    modulePreload: false,
  },
  environments: {
    client: {
      build: {
        // Watch rebuilds must not delete the other environments' outputs.
        emptyOutDir: mode !== "development",
        rolldownOptions: { input: fileURLToPath(new URL("src/options/options.html", import.meta.url)) },
      },
    },
    background: scriptEnvironment("src/background/service-worker.ts", "es"),
    page: scriptEnvironment("src/content/content-script.ts", "es", true),
    company: scriptEnvironment("src/content/company-stats.ts", "iife"),
    chat: scriptEnvironment("src/content/chat.ts", "iife"),
  },
}));
