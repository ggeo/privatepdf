#!/usr/bin/env node

/**
 * Tauri Build Script
 * 1. Move API routes (can't be in static export)
 * 2. Build Next.js with TAURI_BUILD=true
 * 3. Fix index.html to redirect to privatepdf.html
 * 4. Restore API routes
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, '..', 'src', 'app', 'api');
const apiBackupPath = path.join(__dirname, '..', '.api-backup-temp');
const outDir = path.join(__dirname, '..', 'out');
const indexHtml = path.join(outDir, 'index.html');
const privatepdfHtml = path.join(outDir, 'privatepdf.html');

// Step 1: Backup API routes
console.log('📦 Moving API routes...');
if (fs.existsSync(apiPath)) {
  if (fs.existsSync(apiBackupPath)) {
    fs.rmSync(apiBackupPath, { recursive: true, force: true });
  }
  fs.renameSync(apiPath, apiBackupPath);
  console.log('✅ API routes moved');
}

try {
  // Step 2: Build Next.js
  console.log('🔨 Building Next.js with TAURI_BUILD=true...');
  execSync('npm run build', {
    stdio: 'inherit',
    env: { ...process.env, TAURI_BUILD: 'true' }
  });

  // Step 3: Fix index.html
  console.log('🔧 Fixing index.html...');
  if (fs.existsSync(privatepdfHtml)) {
    const redirectHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script>window.location.replace('privatepdf.html');</script>
</head>
<body></body>
</html>`;
    fs.writeFileSync(indexHtml, redirectHtml);
    console.log('✅ index.html redirects to privatepdf.html');
  }
} finally {
  // Step 4: Restore API routes
  console.log('🔄 Restoring API routes...');
  if (fs.existsSync(apiBackupPath)) {
    if (fs.existsSync(apiPath)) {
      fs.rmSync(apiPath, { recursive: true, force: true });
    }
    fs.renameSync(apiBackupPath, apiPath);
    console.log('✅ API routes restored');
  }
}

console.log('✅ Tauri build preparation complete!');
