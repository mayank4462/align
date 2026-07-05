import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages serves project sites at username.github.io/REPO_NAME/, so
  // every asset URL needs that repo name as a prefix. If you name your
  // GitHub repo something other than "align", change this to match exactly
  // (e.g. base: '/my-repo-name/').
  base: '/align/',
})
