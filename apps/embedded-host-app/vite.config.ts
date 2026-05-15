import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/chat/stream": "http://127.0.0.1:3000",
      "/chat/history": "http://127.0.0.1:3000",
      "/health": "http://127.0.0.1:3000",
      "/models": "http://127.0.0.1:3000",
    },
  },
});
