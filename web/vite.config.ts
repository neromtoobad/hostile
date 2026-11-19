import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { ogDev } from "./scripts/og-dev";

export default defineConfig({ plugins: [react(), ogDev()], server: { port: 5173 } });
