'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLiveBlogStore } from '@/app/store/useLiveBlogStore';

export default function LiveBlogReader() {
  const params = useParams();
  const blogId = params?.blogId as string;

  // Get state and actions from Zustand store
  const atoms = useLiveBlogStore((state) => state.atoms);
  const isConnected = useLiveBlogStore((state) => state.isConnected);
  const connectionStatus = useLiveBlogStore((state) => state.connectionStatus);
  const fetchInitialAtoms = useLiveBlogStore((state) => state.fetchInitialAtoms);
  const connectWebSocket = useLiveBlogStore((state) => state.connectWebSocket);
  const disconnectWebSocket = useLiveBlogStore((state) => state.disconnectWebSocket);

  useEffect(() => {
    if (!blogId) return;

    // Fetch initial atoms
    fetchInitialAtoms(blogId);

    // Connect to WebSocket
    connectWebSocket(blogId);

    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [blogId, fetchInitialAtoms, connectWebSocket, disconnectWebSocket]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString() + ' on ' + date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Live Blog: {blogId}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {connectionStatus}
                </span>
              </div>
            </div>
            <Link
              href={`/blog/${blogId}/author`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Author Mode
            </Link>
          </div>
        </div>

        {/* Development Mode Banner */}
        {typeof window !== 'undefined' && window.location.port === '3000' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800">
            <div className="max-w-4xl mx-auto px-4 py-2">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                Development Mode: WebSocket live updates disabled. Use <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">npm run preview</code> for full functionality.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {atoms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              No posts yet. Be the first to write something!
            </p>
            <Link
              href={`/blog/${blogId}/author`}
              className="inline-block mt-4 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Go to Author Mode →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {atoms.map((atom) => (
              <article
                key={atom.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 animate-fade-in"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {atom.author || 'Anonymous'}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatTimestamp(atom.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {atom.content}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
