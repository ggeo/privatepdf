# 🚨 CRITICAL BUILD INSTRUCTIONS

## 📦 Platform-Specific Builds

### Linux (Local Build - DEB & RPM)

**Prerequisites:**
- Node.js 18+ (or Bun)
- Rust (via rustup)
- Tauri CLI: `npm install -g @tauri-apps/cli`
- System dependencies:
  ```bash
  # Debian/Ubuntu
  sudo apt install libwebkit2gtk-4.1-dev libssl-dev librsvg2-dev

  # Fedora
  sudo dnf install webkit2gtk4.1-devel openssl-devel librsvg2-devel
  ```

**Build Commands:**
```bash
# Install dependencies
npm install  # or: bun install

# Build Linux packages (DEB + RPM)
npm run tauri:build
```

**Output Location:**
```
src-tauri/target/release/bundle/deb/PrivatePDF_1.0.0_amd64.deb
src-tauri/target/release/bundle/rpm/PrivatePDF-1.0.0-1.x86_64.rpm
```

**What Happens During Build:**
1. `scripts/tauri-build.js` runs automatically (see `src-tauri/tauri.conf.json`)
2. API routes temporarily moved (incompatible with static export)
3. Next.js builds with `TAURI_BUILD=true`
4. `index.html` created with redirect to `privatepdf.html`
5. API routes restored after build
6. Tauri bundles into DEB and RPM packages

**Install & Test:**
```bash
# DEB (Debian/Ubuntu)
sudo dpkg -i src-tauri/target/release/bundle/deb/PrivatePDF_1.0.0_amd64.deb

# RPM (Fedora/RHEL)
sudo rpm -i src-tauri/target/release/bundle/rpm/PrivatePDF-1.0.0-1.x86_64.rpm
```

---

### Windows (GitHub Actions)

**Setup GitHub Actions:**

1. **Workflow file:** `.github/workflows/build-installers.yml`
2. **Repository Secrets Required:** None (uses dummy env vars for build)
3. **Trigger:**
   - Manual: Go to Actions tab → "Build Installers" → Run workflow
   - Automatic: Push version tag (e.g., `git tag v1.0.0 && git push --tags`)

**What Gets Built:**
- **Windows:** `PrivatePDF_1.0.0_x64_en-US.msi` (NSIS installer)

**Download Artifacts:**
1. Go to GitHub Actions → Select workflow run
2. Scroll to "Artifacts" section
3. Download `windows-installer`

**Important Notes:**
- Uses same `scripts/tauri-build.js` as Linux builds
- Environment variables in workflow are placeholders (real values set at runtime)
- `targets: "all"` in `tauri.conf.json` builds platform-appropriate packages
- No need to manually run prepare/restore scripts - `tauri-build.js` handles everything

---

## 🛠️ Build System Architecture

### Key Files

**`scripts/tauri-build.js`** - Single unified build script:
1. Moves `src/app/api/` to `.api-backup-temp/`
2. Runs `npm run build` with `TAURI_BUILD=true`
3. Creates redirect in `out/index.html` → `privatepdf.html`
4. Restores API folder from backup

**`src-tauri/tauri.conf.json`**:
```json
{
  "build": {
    "beforeBuildCommand": "node scripts/tauri-build.js"
  },
  "bundle": {
    "active": true,
    "targets": "all"
  }
}
```
- `beforeBuildCommand: "node scripts/tauri-build.js"` - Runs on ALL builds (local + CI/CD)
- `targets: "all"` - **CRITICAL**: Builds platform-appropriate packages:
  - Linux: DEB + RPM (+ AppImage if linuxdeploy works)
  - Windows: EXE (NSIS installer)
- File associations for PDF/DOC files (right-click → Open with PrivatePDF)

**`.github/workflows/build-installers.yml`**:
```yaml
# Windows job
- name: Build Windows installer
  env:
    NEXT_PUBLIC_APP_URL: http://localhost:3000
  run: bun run tauri:build
```
- Environment variables are **placeholders** (app works offline, doesn't validate at build time)
- No `TAURI_BUILD` env var needed - `tauri-build.js` sets it automatically
- Uses `bun run tauri:build` which calls `tauri-build.js` via `beforeBuildCommand`

**`next.config.js`**:
- `output: 'export'` when `TAURI_BUILD=true` (static export for desktop app)
- Regular build otherwise (for web version)

### Why API Routes Must Be Removed

Next.js API routes use `export const dynamic = "force-dynamic"` which is incompatible with static export (`output: 'export'`). The desktop app doesn't need API routes - it's 100% local with Ollama.

---

## Quick Reference

### Development
```bash
npm run tauri:dev  # Start dev server + Tauri window
```

### Production Build
```bash
# Linux (local)
npm run tauri:build

# Windows (GitHub Actions)
git tag v1.0.0
git push --tags
```

### Run Installed App
```bash
# Linux
privatepdf  # or search in app menu

# Windows
# Start menu → PrivatePDF
```

### Kill Old Development Instances
**Preferred method:** Close window with X button

**If stuck:**
```bash
pkill -f "src-tauri/target/release/app"
```

**⚠️ DO NOT USE:**
```bash
pkill -f "app"  # Too broad - will kill Firefox tabs and other apps!
```

---

## Common Issues & Solutions

### Issue: "Could not connect to localhost: Connection refused"

**Causes:**
1. ❌ Used `cargo build --release` instead of `npm run tauri build`
2. Old app instance still running
3. tRPC code accidentally re-added to codebase
4. Server-side `redirect()` used instead of client-side `useRouter()`

**Solution:**
```bash
# 1. Kill old instances (close window OR use pkill)
pkill -f "src-tauri/target/release/app"

# 2. Verify tRPC is deleted
ls src/lib/trpc       # Should not exist
ls src/server/trpc    # Should not exist

# 3. Build correctly
npm run tauri build --no-bundle

# 4. Run
./src-tauri/target/release/app
```

### Issue: Scroll continues after stopping (momentum/inertia)

**Already Fixed:**
- ✅ React.memo() prevents unnecessary re-renders
- ✅ useMemo() caches ReactMarkdown parsing
- ✅ CSS disables scroll momentum completely
- ✅ NO `scroll-smooth` class

**If still broken:**
- Check `globals.css` has scroll momentum disable CSS
- Check messages container has `style={{ scrollBehavior: 'auto' }}`
- Rebuild: `npm run tauri build --no-bundle`

### Issue: Build fails with "Server Actions not supported"

**Cause:** Server-side code in static export

**Solution:**
- Check `src/app/layout.tsx` does NOT import ClerkProvider or TRPCProvider
- Check `src/app/page.tsx` uses client-side `useRouter()` NOT server `redirect()`
- Ensure `next.config.js` has `output: 'export'`

---

## Project Structure (Desktop App)

```
✅ KEEP:
- src/app/              (Next.js pages - client-side only)
- src/components/       (React components)
- src/lib/services/     (Ollama, PDF processing)
- src/lib/tauri/        (Tauri-specific code)
- src/stores/           (Zustand state)
- src-tauri/            (Rust backend)

❌ DELETED (Not needed in desktop app):
- src/lib/trpc/         (DELETED - no backend API)
- src/server/trpc/      (DELETED - no backend API)
- src/app/api/          (DELETED - no API routes)
```

---

## Remember

1. **ALWAYS use `npm run tauri build`** - Never `cargo build`
2. **Close old instances** before testing - Avoid pkill unless necessary
3. **No tRPC** - Desktop app is 100% local, no backend API
4. **Client-side only** - No server-side code in Next.js pages
5. **Kill by path** - Use `pkill -f "src-tauri/target/release/app"` NOT `pkill -f "app"`

---

## Performance Notes

- ReactMarkdown parsing is expensive - already memoized
- Chat messages use React.memo() to prevent re-renders on scroll
- Scroll momentum disabled for precise control
- All AI processing happens locally via Ollama (localhost:11434)
