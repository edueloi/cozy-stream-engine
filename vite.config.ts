import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const browserEventsPolyfill = resolve(__dirname, "node_modules/events/events.js");

function forceBrowserEventsForJsSIP() {
  return {
    name: "force-browser-events-for-jssip",
    enforce: "pre" as const,
    resolveId(source: string) {
      if (source === "events" || source === "node:events") {
        return browserEventsPolyfill;
      }
      return null;
    },
    transform(code: string, id: string) {
      if (!id.includes("/node_modules/jssip/lib/")) return null;
      const patched = code
        .replaceAll("require('events')", `require(${JSON.stringify(browserEventsPolyfill)})`)
        .replaceAll('require("events")', `require(${JSON.stringify(browserEventsPolyfill)})`)
        .replaceAll("require('node:events')", `require(${JSON.stringify(browserEventsPolyfill)})`)
        .replaceAll('require("node:events")', `require(${JSON.stringify(browserEventsPolyfill)})`);
      return patched === code ? null : { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [...tanstackStart({ server: { entry: "server" } }), react(), tailwindcss(), forceBrowserEventsForJsSIP()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      events: browserEventsPolyfill,
      "node:events": browserEventsPolyfill,
    },
  },
  build: {
    rolldownOptions: {
      external: ["cloudflare:sockets"],
    },
  },
});
