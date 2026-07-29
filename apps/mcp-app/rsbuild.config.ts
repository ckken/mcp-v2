import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: "./src/main.tsx",
    },
  },
  html: {
    title: "Orders Dashboard",
    inject: "body",
    meta: {
      viewport: "width=device-width, initial-scale=1",
    },
  },
  output: {
    inlineScripts: true,
    inlineStyles: true,
    distPath: {
      root: "dist",
    },
  },
  tools: {
    rspack: {
      resolve: {
        alias: {
          react: require.resolve("react"),
          "react-dom": require.resolve("react-dom"),
        },
      },
    },
  },
});
