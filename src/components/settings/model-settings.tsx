'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export function ModelSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Model Settings</CardTitle>
        <CardDescription>
          AI models are now powered by Ollama running locally on your machine
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Ollama-Powered AI</strong>
            <p className="mt-2">
              This app now uses Ollama for fast, local AI inference. Models are downloaded and run entirely on your machine for complete privacy.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Current model: <strong>gemma2:2b</strong> (Light, ~1.3GB)
            </p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
