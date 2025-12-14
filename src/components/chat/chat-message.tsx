'use client';

import React, { useMemo } from 'react';
import type { ChatMessage } from '@/stores/chat-store';
import { cn } from '@/lib/utils';
import { User, Bot, FileText } from 'lucide-react';
import { SourceCard } from './source-card';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export const ChatMessageComponent = React.memo(function ChatMessageComponent({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // Memoize markdown rendering to prevent re-parsing on every scroll
  const renderedContent = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({node, ...props}) => <p className="mb-2 leading-6 text-sm last:mb-0" {...props} />,
        h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-5 mb-3 first:mt-0 pb-2 border-b border-border" {...props} />,
        h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-4 mb-2 first:mt-0" {...props} />,
        h3: ({node, ...props}) => <h3 className="text-base font-bold mt-3 mb-2 first:mt-0" {...props} />,
        h4: ({node, ...props}) => <h4 className="text-sm font-bold mt-3 mb-1 first:mt-0" {...props} />,
        strong: ({node, ...props}) => <strong className="font-bold text-foreground" {...props} />,
        em: ({node, ...props}) => <em className="italic text-foreground/90" {...props} />,
        code: ({node, ...props}: any) => {
          const isInline = !props.className?.includes('language-');
          return isInline
            ? <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono text-xs" {...props} />
            : <code className="block bg-muted/50 p-3 rounded-lg overflow-x-auto text-xs font-mono my-3 border border-border" {...props} />;
        },
        pre: ({node, ...props}) => <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto my-3 border border-border" {...props} />,
        ul: ({node, ...props}) => <ul className="list-disc list-outside pl-5 my-2 space-y-1 text-sm" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal list-outside pl-5 my-2 space-y-1 text-sm" {...props} />,
        li: ({node, ...props}) => <li className="leading-6 pl-1" {...props} />,
        blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/50 bg-muted/30 pl-4 pr-4 py-2 my-4 italic" {...props} />,
        a: ({node, ...props}) => <a className="text-primary font-medium underline decoration-primary/30 hover:decoration-primary transition-colors" {...props} />,
        table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full border-collapse border border-border" {...props} /></div>,
        th: ({node, ...props}) => <th className="border border-border bg-muted px-4 py-2 text-left font-bold" {...props} />,
        td: ({node, ...props}) => <td className="border border-border px-4 py-2" {...props} />,
        hr: ({node, ...props}) => <hr className="border-t-2 border-border my-8" {...props} />,
      }}
    >
      {message.content}
    </ReactMarkdown>
  ), [message.content]);

  return (
    <div className={cn('group relative flex gap-4', isUser ? 'justify-end' : 'justify-start')}>
      <Card className={cn('max-w-[85%]', isUser ? 'bg-sidebar' : 'bg-card')}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl shadow-sm',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-primary'
            )}
          >
            {isUser ? (
              <User className="h-5 w-5" />
            ) : (
              <Bot className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-semibold">{isUser ? 'You' : 'Assistant'}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
              {message.metrics && !isUser && (
                <span className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 text-primary rounded-md font-medium">
                  ⚡ {message.metrics.tokensPerSecond} tok/s • {message.metrics.totalTokens} tokens
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="leading-normal text-sm">
            {message.content ? (
              <>
                {renderedContent}
                {isStreaming && (
                  <span className="inline-block w-1 h-4 ml-1 bg-primary animate-pulse rounded-full" />
                )}
              </>
            ) : isStreaming ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex gap-1">
                  <span className="inline-block w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : null}
          </div>

          {/* Sources - Reserve space to prevent layout shift */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ minHeight: '100px' }}>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <FileText className="h-4 w-4" />
                <span>Sources ({Math.min(3, message.sources.length)})</span>
              </div>
              <div className="space-y-3">
                {message.sources.slice(0, 3).map((source, idx) => (
                  <SourceCard key={`${message.id}-source-${idx}`} source={source} index={idx} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
