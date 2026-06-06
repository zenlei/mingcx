import { defineConfig } from "astro/config";

export default defineConfig({
  devToolbar: {
    enabled: false,
  },
  output: "static",
  vite: {
    server: {
      strictPort: true,
    },
  },
});
