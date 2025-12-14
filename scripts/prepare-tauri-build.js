#!/usr/bin/env node

/**
 * Prepare Tauri Build
 *
 * Temporarily deletes API routes to exclude them from static export
 * API routes don't work with static export and aren't needed in desktop app
 */

const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');
const backupDir = path.join(__dirname, '..', '.api-backup');
const nextDir = path.join(__dirname, '..', '.next');
const outDir = path.join(__dirname, '..', 'out');

console.log('📦 Preparing for Tauri build...');

// Clean build artifacts
console.log('🧹 Cleaning build cache...');
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log('   Removed .next/');
}
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log('   Removed out/');
}

// Backup API routes outside src/ to avoid Next.js finding them
console.log('💾 Backing up API routes...');
if (fs.existsSync(apiDir)) {
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
  fs.renameSync(apiDir, backupDir);
  console.log('   API routes moved to .api-backup/');
} else {
  console.log('   No API routes found');
}

console.log('✅ Ready for Tauri build (static export, no API routes)');
