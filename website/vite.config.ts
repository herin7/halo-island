import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const lib = fileURLToPath(new URL('../packages/halo-island/src/', import.meta.url));

export default defineConfig(({ mode }) => {
  // Share cards need absolute URLs; set VITE_SITE_URL per deployment.
  const site = (process.env.VITE_SITE_URL || loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL || 'https://halo-island-psi.vercel.app').replace(/\/$/, '');
  return {
    plugins: [react(), { name: 'site-url', transformIndexHtml: (html: string) => html.replaceAll('%SITE_URL%', site) }],
    // The site renders the library's own spec, so templates in ../example import unchanged.
    resolve: { alias: { 'halo-island': lib + 'spec.ts', '@halo/icons': lib + 'icons.ts' } },
    server: { fs: { allow: ['..'] } },
  };
});
