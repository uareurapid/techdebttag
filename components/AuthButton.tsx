'use client';

import { useSession, signIn, signOut } from 'next-auth/react';

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="w-6 h-6 rounded-full bg-[#2a2a30] animate-pulse" />
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn('github')}
        className="text-xs px-3 py-1.5 rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
      >
        Sign in with GitHub
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {session.user?.image && (
        <img
          src={session.user.image}
          alt=""
          className="w-6 h-6 rounded-full ring-1 ring-[#3b82f6]/40"
        />
      )}
      <span className="text-xs text-[var(--text-secondary)] max-w-[120px] truncate">
        {session.user?.name}
      </span>
      <button
        onClick={() => signOut()}
        className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
