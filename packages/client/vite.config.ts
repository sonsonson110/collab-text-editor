/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:8081",
          changeOrigin: true,
        },
        "/ws": {
          target: env.VITE_WS_PROXY_TARGET || "ws://localhost:1234",
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws/, ""),
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      environment: "node",
    },
  };
});
