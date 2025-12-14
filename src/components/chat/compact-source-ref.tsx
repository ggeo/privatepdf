'use client';

import React from 'react';
import type { SearchResult } from '@/lib/services/semantic-search';

interface CompactSourceRefProps {
  source: SearchResult;
  index: number;
}

/**
 * Compact source reference showing just page number and similarity
 * Used for sources 4+ to keep the UI clean
 */
export function CompactSourceRef({ source, index }: CompactSourceRefProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
      <span className="font-semibold text-primary">[{index + 1}]</span>
      <span className="text-muted-foreground">
        {source.pageNumber ? `Page ${source.pageNumber}` : `Source ${index + 1}`}
      </span>
      <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        {Math.round(source.similarity * 100)}% match
      </span>
    </div>
  );
}
