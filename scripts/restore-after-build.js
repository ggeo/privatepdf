#!/usr/bin/env node

/**
 * Restore After Tauri Build
 *
 * Restores API routes after Tauri build completes
 */

const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');
const backupDir = path.join(__dirname, '..', '.api-backup');
const outDir = path.join(__dirname, '..', 'out');
const privatepdfHtml = path.join(outDir, 'privatepdf.html');
const indexHtml = path.join(outDir, 'index.html');

console.log('🔄 Restoring API routes...');

// Restore api directory from backup
if (fs.existsSync(backupDir)) {
  if (fs.existsSync(apiDir)) {
    fs.rmSync(apiDir, { recursive: true, force: true });
  }
  fs.renameSync(backupDir, apiDir);
  console.log('✅ API routes restored to src/app/api/');
} else {
  console.log('ℹ️  No backup found');
}

// Fix index.html to redirect to privatepdf page for desktop app
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
  console.log('✅ index.html now redirects to /privatepdf');
} else {
  console.log('⚠️  privatepdf.html not found, skipping');
}

console.log('✅ Cleanup complete');
