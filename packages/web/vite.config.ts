import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {

  const env = loadEnv(mode, process.cwd(), "REACT_APP_");

  return {
    plugins: [react(), cesium()],
    envPrefix: "REACT_APP_",
    resolve: {
      alias: {
        "@": "/src",
        "@zip.js/zip.js/lib/zip-no-worker.js": fileURLToPath(
          new URL("./src/components/cesium/zip-no-worker.js", import.meta.url)
        ),
      },
    },
    build: {
      outDir: "./build",
      assetsDir: "front-assets",
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.REACT_APP_BACK_URL ?? 'http://localhost:8080',
          changeOrigin: true
          //rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/assets': {
          target: env.REACT_APP_BACK_URL ?? 'http://localhost:8080',
          changeOrigin: true
        }
      }
    }
  };
});
