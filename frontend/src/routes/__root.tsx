import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/Toast';
import { useToast } from '../hooks/useToast';

interface RouterContext {
  queryClient: QueryClient;
}

// Fetch current user
async function fetchMe() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json() as Promise<{ email: string; role: 'admin' | 'viewer' }>;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ToastProvider>
      <RootLayoutInner />
    </ToastProvider>
  );
}

function RootLayoutInner() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const toast = useToast();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success('インターネット接続が復旧しました');
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast.warning('インターネット接続がありません', 0); // 0 = no auto-dismiss
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const isAdmin = me?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium">
          オフライン: インターネット接続がありません
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Kakeibo App</h1>
            <div className="text-sm text-gray-600">
              {me?.email} ({me?.role})
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex gap-6 overflow-x-auto py-3">
            {/* Viewer accessible routes */}
            <NavLink to="/">ダッシュボード</NavLink>
            <NavLink to="/comparison">月次比較</NavLink>
            <NavLink to="/tags">タグ集計</NavLink>
            <NavLink to="/ai">AI分析</NavLink>

            {/* Admin only routes */}
            {isAdmin && (
              <>
                <div className="border-l border-gray-300" />
                <NavLink to="/transactions">取引詳細</NavLink>
                <NavLink to="/import">CSVインポート</NavLink>
                <NavLink to="/settings">設定</NavLink>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Devtools (only in development) */}
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="whitespace-nowrap text-sm font-medium text-gray-600 hover:text-gray-900 [&.active]:text-primary [&.active]:font-semibold"
      activeProps={{ className: 'active' }}
    >
      {children}
    </Link>
  );
}
