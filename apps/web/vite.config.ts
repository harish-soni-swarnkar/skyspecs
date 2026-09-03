import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Read the shared .env at the repo root so VITE_API_URL lives with the rest of the config.
  envDir: "../../",
  server: { port: 5173 },
});
