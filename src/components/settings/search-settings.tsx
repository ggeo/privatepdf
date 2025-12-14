'use client';

import { CHUNK_SETTINGS, SEARCH_SETTINGS } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Search, FileText } from 'lucide-react';

export function SearchSettings() {
  // Read-only display of developer-defined constants

  return (
    <div className="space-y-6">
      {/* Search Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Settings
          </CardTitle>
          <CardDescription>
            Configure how documents are searched
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Top K */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Number of results</Label>
              <span className="text-sm font-medium">{SEARCH_SETTINGS.topK}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              How many document chunks to retrieve for each query
            </p>
          </div>

          {/* Minimum Similarity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Minimum similarity</Label>
              <span className="text-sm font-medium">
                {Math.round(SEARCH_SETTINGS.minSimilarity * 100)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Filter out results below this similarity threshold
            </p>
          </div>

          {/* Reranking */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Use re-ranking</Label>
              <p className="text-sm text-muted-foreground">
                Improve result quality with multi-factor re-ranking
              </p>
            </div>
            <span className="text-sm font-medium">
              {SEARCH_SETTINGS.useReranking ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Chunk Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Processing
          </CardTitle>
          <CardDescription>
            Configure how PDFs are split into chunks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chunk Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Chunk size (tokens)</Label>
              <span className="text-sm font-medium">{CHUNK_SETTINGS.chunkSize}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Larger chunks = more context, but less precise search results
            </p>
          </div>

          {/* Chunk Overlap */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Overlap (tokens)</Label>
              <span className="text-sm font-medium">{CHUNK_SETTINGS.chunkOverlap}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Overlap prevents splitting important information across chunks
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Note:</strong> These are developer-defined constants optimized for best performance.
          They apply to all document processing.
        </AlertDescription>
      </Alert>
    </div>
  );
}
