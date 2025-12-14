import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { TauriLogBridge } from '@/components/tauri-log-bridge';
import { ErrorBoundary } from '@/components/error-boundary';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// Force static export for Tauri
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'PrivatePDF - Chat with PDFs Locally',
  description:
    'Browser-based PDF chat with 100% local AI. No cloud uploads, complete privacy.',
  keywords: [
    'PDF chat',
    'local AI',
    'privacy',
    'document analysis',
    'browser AI',
  ],
  authors: [{ name: 'PrivatePDF' }],
  openGraph: {
    title: 'PrivatePDF - Chat with PDFs Locally',
    description: 'Browser-based PDF chat with 100% local AI',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <TauriLogBridge />
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
