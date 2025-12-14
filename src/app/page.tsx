'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Zap, HardDrive, Download, Check, Monitor, Laptop, X } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  const router = useRouter();
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedUseCaseImage, setSelectedUseCaseImage] = useState<string | null>(null);

  // Redirect to /privatepdf if running in Tauri (desktop app)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      router.push('/privatepdf');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-50 border-b border-gray-100 dark:border-gray-800">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <Shield className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">PrivatePDF</span>
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Features</a>
            <a href="#use-cases" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Use Cases</a>
            <Link href="/how-to-use" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">How to Use</Link>
            <a href="#faq" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">FAQ</a>
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

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-sm font-medium">
              <Zap className="w-4 h-4" />
              Open Source • 100% Private • Local AI
            </div>

            <h1 className="text-6xl md:text-7xl font-bold leading-tight text-gray-900 dark:text-white">
              Chat with PDFs.
              <br />
              <span className="text-blue-600 dark:text-blue-400">100% Local.</span>
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              A local-first PDF RAG application powered by Ollama.
              <br />
              <span className="font-semibold text-gray-900 dark:text-white">No cloud. No API keys. Complete privacy.</span>
              <br />
              Your documents never leave your computer.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/privatepdf">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-6">
                  Launch App
                </Button>
              </Link>
              <a href="https://github.com/yourusername/privatepdf/releases" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                  <Download className="w-5 h-5 mr-2" />
                  Download Desktop App
                </Button>
              </a>
            </div>

          </div>

          {/* Hero Media - Video + Screenshot */}
          <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Video */}
            <div className="rounded-2xl border-4 border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden bg-black">
              <video
                className="w-full h-full object-cover"
                controls
                preload="metadata"
              >
                <source src="/media/demo-video.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Screenshot */}
            <div
              className="rounded-2xl border-4 border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setIsImageModalOpen(true)}
            >
              <img
                src="/media/app-screenshot.png"
                alt="PrivatePDF Interface"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Image Modal */}
      {isImageModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsImageModalOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setIsImageModalOpen(false)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src="/media/app-screenshot.png"
            alt="PrivatePDF Interface - Full Size"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      {/* Use Case Screenshot Modal */}
      {selectedUseCaseImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedUseCaseImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setSelectedUseCaseImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={selectedUseCaseImage}
            alt="Use Case Example"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}


      {/* Cross-Platform Visual Section */}
      <section className="py-16 px-6 bg-white dark:bg-gray-950">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Cross-Platform Desktop
            </h3>
            <p className="text-gray-600 dark:text-gray-300">Native apps for Windows & Linux</p>
          </div>

          <div className="relative flex items-center justify-center py-16 w-full max-w-2xl mx-auto min-h-[300px]">
            {/* Dashed lines using SVG */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 700 400"
              preserveAspectRatio="xMidYMid meet"
              style={{ zIndex: 1 }}
            >
              {/* Line to Windows (left) */}
              <path
                d="M 280 200 C 200 200, 150 200, 90 200"
                stroke="rgb(59 130 246)"
                strokeWidth="3"
                strokeDasharray="8,6"
                fill="none"
                strokeLinecap="round"
                opacity="0.8"
              />

              {/* Line to Linux (right) */}
              <path
                d="M 420 200 C 500 200, 550 200, 610 200"
                stroke="rgb(168 85 247)"
                strokeWidth="3"
                strokeDasharray="8,6"
                fill="none"
                strokeLinecap="round"
                opacity="0.8"
              />
            </svg>

            {/* Center laptop illustration */}
            <div className="relative z-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg p-4 shadow-2xl">
              <div className="bg-blue-500 rounded-md w-28 h-20 flex items-center justify-center">
                <Shield className="w-10 h-10 text-white" />
              </div>
              <div className="mt-1.5 text-center text-white text-[11px] font-semibold">PrivatePDF</div>
            </div>

            {/* Platform icons - Windows left, Linux right */}
            <div className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-2.5 shadow-lg z-20">
              <Monitor className="w-6 h-6 text-white" />
              <div className="text-[10px] text-white font-semibold mt-0.5 text-center">Windows</div>
            </div>

            <div className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-2.5 shadow-lg z-20">
              <Laptop className="w-6 h-6 text-white" />
              <div className="text-[10px] text-white font-semibold mt-0.5 text-center">Linux</div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Badge Section */}
      <section className="py-12 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <Lock className="w-10 h-10" />
              <h3 className="font-semibold text-lg">Zero Cloud Storage</h3>
              <p className="text-sm text-blue-100">Your documents never leave your computer</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <HardDrive className="w-10 h-10" />
              <h3 className="font-semibold text-lg">100% Local AI</h3>
              <p className="text-sm text-blue-100">Powered by Ollama on your machine</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Shield className="w-10 h-10" />
              <h3 className="font-semibold text-lg">Open Source</h3>
              <p className="text-sm text-blue-100">Free to use, modify, and distribute</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-5xl font-bold text-gray-900 dark:text-white">
              Chat With Your <span className="text-blue-600 dark:text-blue-400">PDFs</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Upload a PDF, ask questions, get answers with page citations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '🎯',
                title: 'Advanced RAG Engine',
                description: 'Semantic search with vector embeddings. Only retrieves relevant chunks—no context limit worries, handles 10,000+ page documents effortlessly.',
              },
              {
                icon: '📚',
                title: 'Multi-Document Intelligence',
                description: 'Query across multiple PDFs simultaneously. Compare contracts, cross-reference research papers, or analyze entire document libraries.',
              },
              {
                icon: '🔖',
                title: 'Source Citations',
                description: 'Every answer includes exact page numbers and highlighted text. Verify AI responses against original sources instantly.',
              },
              {
                icon: '💾',
                title: 'Persistent Document Library',
                description: 'Process documents once, query forever. All data stored locally in IndexedDB—no re-uploading, no re-processing.',
              },
              {
                icon: '🔍',
                title: 'Smart Chunking & Embeddings',
                description: 'Intelligent text segmentation with overlap. Vector embeddings find semantically similar content, not just keyword matches.',
              },
              {
                icon: '📄',
                title: 'OCR for Scanned PDFs',
                description: 'Built-in Tesseract OCR extracts text from scanned documents. Works with images, receipts, and legacy files.',
              },
              {
                icon: '💬',
                title: 'Conversation Management',
                description: 'Separate chat sessions per document or topic. Export conversations, review chat history, and maintain context.',
              },
              {
                icon: '🔒',
                title: '100% Local Processing',
                description: 'All AI runs via Ollama on YOUR computer. Documents never uploaded. No cloud dependencies. Complete privacy guaranteed.',
              },
              {
                icon: '⚡',
                title: 'Memory Efficient',
                description: 'Only sends relevant chunks to LLM (not entire PDFs). Faster responses than naive context dumping.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-400"
              >
                <div className="text-5xl mb-4 transition-transform duration-300 group-hover:scale-110">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="py-24 px-6 bg-white dark:bg-gray-950">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-5xl font-bold text-gray-900 dark:text-white">
              Perfect for <span className="text-blue-600 dark:text-blue-400">Every Use Case</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Whether you're a student, researcher, lawyer, or professional, PrivatePDF adapts to your needs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                title: '🎓 Students & Researchers',
                description: 'Analyze academic papers, extract key findings, and write literature reviews faster. Perfect for thesis research.',
                features: ['Multi-document comparison', 'Citation tracking', 'Research notes export'],
                image: '/media/Students_Researchers.png',
              },
              {
                title: '⚖️ Legal Professionals',
                description: 'Review contracts, case files, and legal documents with complete confidentiality. Client data stays private.',
                features: ['Contract analysis', 'Clause extraction', 'Precedent search'],
                image: '/media/Legal_Professionals.png',
              },
              {
                title: '💼 Business Analysts',
                description: 'Extract insights from reports, financial statements, and market research without exposing sensitive data.',
                features: ['Financial document analysis', 'Report summarization', 'Data extraction'],
                image: '/media/Business_Analysts.png',
              },
              {
                title: '🏥 Healthcare Workers',
                description: 'Review medical literature and patient documents while maintaining HIPAA compliance through local processing.',
                features: ['Medical paper analysis', 'Protocol review', 'Patient data privacy'],
                image: '/media/Healthcare_Workers.gif',
              },
              {
                title: '📚 Writers & Journalists',
                description: 'Research sources, fact-check information, and organize reference materials for your next article or book.',
                features: ['Source verification', 'Quote extraction', 'Research organization'],
                image: '/media/Writers_Journalists.png',
              },
              {
                title: '👨‍💻 Developers',
                description: 'Query technical documentation, API references, and code repositories without internet dependency.',
                features: ['Documentation search', 'API reference lookup', 'Offline access'],
                image: '/media/Developers.gif',
              },
            ].map((useCase, i) => (
              <div
                key={i}
                className="group bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-2xl p-8 border border-blue-100 dark:border-blue-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                onClick={() => setSelectedUseCaseImage(useCase.image)}
              >
                <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{useCase.title}</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">{useCase.description}</p>
                <ul className="space-y-2">
                  {useCase.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Click to see example →
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-5xl font-bold text-gray-900 dark:text-white">
              Frequently Asked <span className="text-blue-600">Questions</span>
            </h2>
          </div>

          <div className="space-y-6">
            {[
              {
                q: 'How is PrivatePDF different from ChatGPT or Claude?',
                a: 'Unlike ChatGPT or Claude which send your data to the cloud, PrivatePDF runs entirely on your computer using Ollama. Your documents never leave your device, ensuring complete privacy for sensitive information.',
              },
              {
                q: 'What is Ollama and why do I need it?',
                a: 'Ollama is a free, open-source tool that runs AI models locally on your computer. PrivatePDF automatically guides you through installing and managing Ollama, making setup effortless. It enables lightning-fast AI inference without internet dependency.',
              },
              {
                q: 'Will this work on my computer?',
                a: 'Yes! PrivatePDF works on any modern computer (Windows, Linux). For best performance, we recommend a dedicated GPU with at least 4GB VRAM. CPU-only setups will work but expect slower responses.',
              },
              {
                q: 'Is my data really private?',
                a: 'Absolutely. Your documents, conversations, and embeddings are stored locally on your device. We never upload documents anywhere. Everything runs 100% locally.',
              },
              {
                q: 'Can I use PrivatePDF offline?',
                a: 'Yes! After the initial setup (downloading Ollama and AI models), PrivatePDF works completely offline. Perfect for travel and secure environments.',
              },
              {
                q: 'What file formats are supported?',
                a: 'PrivatePDF supports PDF, DOC, and DOCX files up to 10,000 pages. We support both text-based documents and scanned files (via OCR).',
              },
              {
                q: 'Is PrivatePDF free?',
                a: 'Yes! PrivatePDF is open source and free to use. You can download the source code, build it yourself, or download pre-built installers from GitHub releases.',
              },
            ].map((faq, i) => (
              <details key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                <summary className="font-semibold text-lg cursor-pointer text-gray-900 dark:text-white">
                  {faq.q}
                </summary>
                <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="py-24 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-5xl font-bold">
            Ready to Chat with Your PDFs?
          </h2>
          <p className="text-xl text-blue-100">
            100% free and open source. Your data stays on your device.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/privatepdf">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 text-lg px-8 py-6">
                Launch App
              </Button>
            </Link>
            <a href="https://github.com/yourusername/privatepdf" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8 py-6">
                View on GitHub
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-gray-900 text-gray-400">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-6 h-6 text-blue-500" />
                <span className="text-xl font-bold text-white">PrivatePDF</span>
              </div>
              <p className="text-sm">
                The privacy-first document AI assistant powered by local models. Open source and free.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#use-cases" className="hover:text-white transition-colors">Use Cases</a></li>
                <li><Link href="/how-to-use" className="hover:text-white transition-colors">How to Use</Link></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="https://github.com/ggeo/privatepdf_personal/issues" className="hover:text-white transition-colors">GitHub Issues</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 text-center text-sm">
            <p>© 2025 PrivatePDF. Open source under MIT License. Built with 🔒 for your privacy.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
