import { defineConfig } from 'vite';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: projectRoot,
  plugins: [
    {
      name: 'html-fallback',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url.split('?')[0];
          // Rewrite SPA paths to dashboard.html / login.html
          if (['/login', '/register', '/signup'].includes(url)) {
            req.url = '/login.html';
          } else if (['/dashboard', '/profile'].includes(url)) {
            req.url = '/dashboard.html';
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        dashboard: 'dashboard.html',
        login: 'login.html',
      },
    },
  },
});
