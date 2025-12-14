### PrivatePDF - Open Source Local PDF Chat

A local-first PDF RAG application that uses Ollama for AI inference. Users can chat with PDFs using AI models that run on their machine—no cloud uploads, no API dependencies, complete privacy.

### Tech Stack

- **Framework**: Next.js 15 + Bun + TypeScript + Tailwind v4 + Radix UI + shadcn
- **Desktop Runtime**: Tauri v2 (Rust backend, web frontend)
- **PDF Processing**: pdf.js (Mozilla)
- **AI Integration**: Ollama (localhost:11434)
  - LLM: gemma3:1b-it-q4_K_M
  - Embeddings: nomic-embed-text
- **Vector Storage**: IndexedDB
- **State**: Zustand + TanStack Query
- **OCR**: Tesseract.js (WASM)

### Project Structure

```
src/
├── app/              # Next.js pages (landing, privatepdf, how-to-use)
├── components/       # React components
│   ├── chat/         # Chat interface components
│   ├── documents/    # Document upload/management
│   ├── ollama/       # Ollama setup/status components
│   ├── pdf/          # PDF preview components
│   ├── settings/     # Settings components
│   └── ui/           # shadcn UI components
├── contexts/         # React contexts
├── hooks/            # Custom hooks
├── lib/              # Core libraries
│   ├── services/     # Ollama, IndexedDB, PDF processing
│   └── utils/        # Utility functions
├── stores/           # Zustand stores
└── types/            # TypeScript types

src-tauri/            # Tauri/Rust backend
```

### Development Commands

```bash
bun install           # Install dependencies
bun run dev           # Start Next.js dev server
bun run tauri:dev     # Start Tauri dev (includes Next.js)
bun run tauri:build   # Build desktop app
bun run lint          # Run ESLint
bun run type-check    # Run TypeScript check
```

### Code Standards

- **File limit**: 500 lines max
- **Imports**: External → internal → types
- **Naming**: camelCase functions, PascalCase components/types, kebab-case files
- **TypeScript**: Strict mode, explicit types for functions

### Key Workflows

**PDF Processing:**
1. Parse with pdf.js → Extract text by page
2. Chunk text (256 tokens, 30 overlap)
3. Generate embeddings via Ollama (nomic-embed-text)
4. Store in IndexedDB

**Chat Query:**
1. Generate query embedding via Ollama
2. Vector search in IndexedDB (cosine similarity, top-5)
3. Build context with retrieved chunks
4. Call Ollama chat API (gemma3:1b-it-q4_K_M)
5. Stream response with source citations
