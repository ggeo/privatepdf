'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Download, Shield, FileText, MessageSquare, Settings as SettingsIcon, ArrowRight, Power, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function HowToUsePage() {
  const [currentOS, setCurrentOS] = useState<'windows' | 'linux'>('windows');

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header Navigation */}
      <header className="fixed top-0 w-full bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-50 border-b border-gray-100 dark:border-gray-800">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Shield className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">PrivatePDF</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Features</Link>
            <Link href="/#use-cases" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Use Cases</Link>
            <Link href="/how-to-use" className="text-blue-600 dark:text-blue-400 font-semibold">How to Use</Link>
            <Link href="/#faq" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">FAQ</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privatepdf">
              <Button className="bg-blue-600 hover:bg-blue-700">
                Launch App
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <div className="pt-32 pb-20 px-8 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
        <div className="max-w-5xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
              How to Use PrivatePDF
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Complete step-by-step guide for setting up PrivatePDF on your computer
            </p>
          </div>

        {/* Getting Started Steps */}
        <Card className="mb-8 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white text-2xl">Quick Start Guide</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-300">
              Follow these steps to get PrivatePDF up and running
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">

            {/* Step 1: Download & Install */}
            <Step
              number={1}
              title="Download & Install PrivatePDF"
              icon={<Download className="w-6 h-6" />}
            >
              <ol className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-200 ml-4">
                <li>Download PrivatePDF from the GitHub releases page</li>
                <li>Download the installer for your operating system</li>
                <li>Install PrivatePDF:
                  <ul className="ml-6 mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li><strong>Windows:</strong> Run the .exe installer</li>
                    <li><strong>Linux:</strong> Install .deb (Ubuntu/Debian) or .rpm (Fedora/RHEL)</li>
                  </ul>
                </li>
              </ol>
            </Step>

            {/* Step 2: Start Ollama */}
            <Step
              number={2}
              title="Set Up Ollama (AI Engine)"
              icon={<Power className="w-6 h-6" />}
            >
              <p className="text-gray-700 dark:text-gray-200 mb-3">
                After launching PrivatePDF, you'll see the main interface with <strong>"Ollama Not Running"</strong> message:
              </p>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 dark:text-gray-200 ml-4">
                <li>
                  <strong>Click "Start Ollama" button</strong> in the chat area
                  <ul className="ml-6 mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li>The app will attempt to start Ollama automatically</li>
                    <li>If Ollama is not installed, you'll see an error message</li>
                  </ul>
                </li>
                <li>
                  <strong>If Ollama is not installed:</strong>
                  <ul className="ml-6 mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li>Click <strong>"Setup Ollama"</strong> button</li>
                    <li>A modal will appear with a <strong>"Download Ollama"</strong> link</li>
                    <li>Click the link to visit ollama.com/download</li>
                    <li>Download and install Ollama for your OS (see platform-specific instructions below)</li>
                    <li>After installing, return to PrivatePDF and click <strong>"Try Auto-Start Again"</strong></li>
                  </ul>
                </li>
                <li>
                  Once Ollama starts, click <strong>"Check Status"</strong> to confirm it's running
                </li>
              </ol>
            </Step>

            {/* Step 3: Download Model */}
            <Step
              number={3}
              title="Download AI Model"
              icon={<Download className="w-6 h-6" />}
            >
              <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-200 ml-4">
                <li>After Ollama is running, the Setup Modal will show <strong>"Download Recommended Model"</strong> button</li>
                <li>Click <strong>"Download Recommended Model"</strong></li>
                <li>The app will download <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-sm">gemma3:1b-it-q4_K_M</code> (~815MB)</li>
                <li>A progress bar will show download status</li>
                <li>Wait for download to complete (usually 2-5 minutes depending on your internet speed)</li>
              </ol>
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <strong>First time only!</strong> Once downloaded, the model stays on your computer and works offline.
                </p>
              </div>
            </Step>

            {/* Step 4: Upload & Chat */}
            <Step
              number={4}
              title="Upload PDF and Start Chatting"
              icon={<FileText className="w-6 h-6" />}
            >
              <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-200 ml-4">
                <li>Click the <strong>"+"</strong> button in the sidebar or drag & drop a PDF file</li>
                <li>Wait for processing:
                  <ul className="ml-6 mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li>App extracts text from PDF</li>
                    <li>Creates embeddings using Ollama</li>
                    <li>Stores data locally in your browser (IndexedDB)</li>
                  </ul>
                </li>
                <li>Once processed, the PDF appears in your sidebar</li>
                <li>Select the document (it gets highlighted)</li>
                <li>Type your question in the chat input</li>
                <li>Press Enter - AI will answer based on your document!</li>
              </ol>
              <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <strong>Multi-document chat:</strong> Select multiple PDFs from the sidebar to ask questions across all of them!
                </p>
              </div>
            </Step>

          </CardContent>
        </Card>

        {/* Platform-Specific Ollama Installation */}
        <Card className="mb-8 bg-white dark:bg-gray-800 backdrop-blur border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Platform-Specific Ollama Installation</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-300">
              Detailed installation steps for Windows and Linux
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={currentOS} onValueChange={(v) => setCurrentOS(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="windows">Windows</TabsTrigger>
                <TabsTrigger value="linux">Linux</TabsTrigger>
              </TabsList>

              {/* Windows */}
              <TabsContent value="windows" className="space-y-4 mt-6 text-gray-700 dark:text-gray-200">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Installing Ollama on Windows</h3>
                <ol className="list-decimal list-inside space-y-3">
                  <li>Download from <a href="https://ollama.com/download/windows" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">ollama.com/download/windows <ExternalLink className="w-3 h-3" /></a></li>
                  <li>Run OllamaSetup.exe</li>
                  <li>Follow installation wizard</li>
                  <li>Ollama will appear in your system tray (bottom-right, near clock)</li>
                  <li>Return to PrivatePDF and click <strong>"Try Auto-Start Again"</strong></li>
                </ol>
                <div className="p-3 bg-blue-500/10 border border-blue-400/20 rounded text-sm">
                  💡 <strong>Tip:</strong> Ollama runs in the background. You don't need to keep a window open.
                </div>
              </TabsContent>

              {/* Linux */}
              <TabsContent value="linux" className="space-y-4 mt-6 text-gray-700 dark:text-gray-200">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Installing Ollama on Linux</h3>
                <p className="text-sm">Open terminal and run:</p>
                <pre className="bg-black/50 p-4 rounded-lg text-green-400 text-sm overflow-x-auto">
                  curl -fsSL https://ollama.com/install.sh | sh
                </pre>
                <p className="text-sm">This installs Ollama system-wide on most distributions (Ubuntu, Debian, Fedora, etc.)</p>

                <p className="text-sm mt-4">After installation, PrivatePDF will start Ollama automatically by running <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-sm">ollama serve</code></p>

                <div className="p-3 bg-blue-500/10 border border-blue-400/20 rounded text-sm mt-4">
                  💡 <strong>Tip:</strong> You can also manually start Ollama with <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">ollama serve</code>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card className="mb-8 bg-white dark:bg-gray-800 backdrop-blur border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <SettingsIcon className="w-6 h-6" />
              Troubleshooting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TipCard
              title="Ollama won't start?"
              tips={[
                'Make sure Ollama is installed (download from ollama.com)',
                'Check if Ollama is already running (system tray on Windows)',
                'Try manually starting Ollama from Start Menu (Windows) or terminal (Linux: ollama serve)',
                'Restart your computer and try again',
                'Make sure port 11434 is not blocked by firewall'
              ]}
            />

            <TipCard
              title="Model download fails?"
              tips={[
                'Check your internet connection',
                'Make sure you have at least 1GB of free disk space',
                'The download happens through Ollama - make sure Ollama is running',
                'Close the setup modal and try clicking "Start Ollama" again'
              ]}
            />

            <TipCard
              title="PDF processing takes forever?"
              tips={[
                'Large PDFs (500+ pages) may take 5-10 minutes to process',
                'Processing happens once per PDF - subsequent chats are instant',
                'Make sure Ollama is running and model is downloaded',
                'Close other applications to free up RAM and CPU'
              ]}
            />

            <TipCard
              title="Chat gives wrong answers?"
              tips={[
                'Make sure the PDF is selected in the sidebar (highlighted)',
                'Try asking more specific questions',
                'Check if the PDF has readable text (not scanned images)',
                'For scanned PDFs, wait for OCR processing to complete'
              ]}
            />
          </CardContent>
        </Card>

        {/* Privacy Note */}
        <Card className="mb-8 bg-gradient-to-br from-green-500/20 to-blue-500/20 border-green-200 dark:border-green-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-6 h-6" />
              Your Privacy is Protected
            </CardTitle>
          </CardHeader>
          <CardContent className="text-gray-700 dark:text-gray-200 space-y-2">
            <p>✅ <strong>All processing happens on YOUR computer</strong> - PDFs never leave your device</p>
            <p>✅ <strong>AI runs locally via Ollama</strong> - No data sent to OpenAI, Anthropic, or any cloud service</p>
            <p>✅ <strong>Works offline</strong> - Once model is downloaded, internet is not required</p>
            <p>✅ <strong>Data stored locally</strong> - PDFs and chat history in IndexedDB (browser storage)</p>
            <p>⚠️ <strong>Internet only required for:</strong> Model downloads and app updates</p>
          </CardContent>
        </Card>

          {/* CTA */}
          <div className="text-center">
            <Link href="/privatepdf">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                Launch App <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function Step({ number, title, icon, children }: { number: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center text-gray-900 dark:text-white font-bold text-lg">
          {number}
        </div>
      </div>
      <div className="flex-1">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <div className="text-gray-700 dark:text-gray-200">
          {children}
        </div>
      </div>
    </div>
  );
}

function TipCard({ title, tips }: { title: string; tips: string[] }) {
  return (
    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-400" />
        {title}
      </h4>
      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
        {tips.map((tip, i) => (
          <li key={i}>• {tip}</li>
        ))}
      </ul>
    </div>
  );
}
