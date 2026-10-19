import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Source maps are built, uploaded to Sentry and then deleted, so they never
// reach the browser. Upload only happens when SENTRY_AUTH_TOKEN is set (CI).
export default defineConfig({
  root: "web",
  base: "/sentry/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: "hidden",
  },
  define: {
    __RELEASE__: JSON.stringify(process.env.RELEASE || "dev"),
  },
  plugins: [
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: "playground-browser",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.RELEASE }, // commits are set by the workflow
      sourcemaps: { filesToDeleteAfterUpload: ["../dist/**/*.map"] },
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  server: { proxy: { "/sentry/api": "http://localhost:3090" } },
});
