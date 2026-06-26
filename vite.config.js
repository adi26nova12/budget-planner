import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        login: resolve(__dirname, 'login.html'),
      },
    },
  },
});
