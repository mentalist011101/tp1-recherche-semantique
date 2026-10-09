import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.SEMANTICA_API ?? "http://127.0.0.1:8000";

// Vite impose un export default pour son fichier de configuration.
export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		proxy: {
			"/api": backend,
			"/slides": backend,
		},
	},
});
