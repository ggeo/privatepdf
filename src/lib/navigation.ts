/**
 * Navigation helper for Tauri app
 *
 * Dev mode (tauri:dev): Next.js dev server at localhost:3000 - use routes WITHOUT .html
 * Production (tauri:build): Static HTML files - use routes WITH .html
 */

/**
 * Navigate to a route in the Tauri app
 * @param route - Route without extension (e.g., '/privatepdf', '/settings', '/activate')
 */
export function navigateTo(route: string): void {
  // Remove leading slash if present
  const cleanRoute = route.startsWith('/') ? route.slice(1) : route;

  // Check if we're in dev mode by looking at the current URL
  // In dev: http://localhost:3000/privatepdf (Next.js dev server)
  // In production: tauri://localhost/privatepdf.html (static files)
  const isDevMode = window.location.hostname === 'localhost' && window.location.port === '3000';

  // Dev mode: use routes without .html (Next.js routing)
  // Production: use .html extension (static files)
  window.location.href = isDevMode ? `/${cleanRoute}` : `/${cleanRoute}.html`;
}
