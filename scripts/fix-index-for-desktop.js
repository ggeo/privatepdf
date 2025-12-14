#!/usr/bin/env node

/**
 * Fix index.html for Desktop App
 *
 * Replaces index.html with a redirect to privatepdf.html
 * This runs AFTER Next.js build but BEFORE Tauri bundles the files
 */

const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');
const indexHtml = path.join(outDir, 'index.html');
const privatepdfHtml = path.join(outDir, 'privatepdf.html');

console.log('🔧 Fixing index.html for desktop app...');

if (fs.existsSync(privatepdfHtml)) {
  // Create instant JavaScript redirect
  const redirectHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script>window.location.replace('privatepdf.html');</script>
</head>
<body></body>
</html>`;

  fs.writeFileSync(indexHtml, redirectHtml);
  console.log('✅ index.html now redirects to privatepdf.html');
} else {
  console.log('⚠️  privatepdf.html not found, skipping');
}
