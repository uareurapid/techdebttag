import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import AuthButton from '@/components/AuthButton';

export const metadata: Metadata = {
  title: 'TechDebtTag — Surface Your Technical Debt',
  description: 'Scan your codebase for TODO, FIXME, HACK, NOTE, OBS, DEBT comments. Prioritize and track technical debt.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <Providers>
          <header className="border-b border-[#2a2a30] bg-[#0c0c0e]">
            <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏷️</span>
                <h1 className="text-lg font-semibold tracking-tight">TechDebtTag</h1>
                <span className="text-xs text-[var(--text-muted)] hidden sm:inline">Surface your technical debt</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">Scan → Surface → Fix</span>
                <AuthButton />
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-6 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
