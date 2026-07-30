import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: {
    entry: {
      index: "./src/main.tsx",
    },
  },
  html: { title: "MCP Case Pulse — E2E Lab" },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/mcp": "http://127.0.0.1:3001",
    },
  },
  tools: {
    rspack: {
      resolve: {
        alias: {
          "@": path.resolve(import.meta.dirname, "src"),
          react: require.resolve("react"),
          "react-dom": require.resolve("react-dom"),
        },
      },
    },
  },
});
