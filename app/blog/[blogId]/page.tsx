'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Atom {
  id: string;
  content: string;
  timestamp: number;
  author?: string;
}

export default function LiveBlogReader() {
  const params = useParams();
  const blogId = params?.blogId as string;

  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!blogId) return;

    // Fetch initial atoms
    fetchInitialAtoms();

    // Connect to WebSocket
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogId]);

  const fetchInitialAtoms = async () => {
    try {
      const response = await fetch(`/api/liveblog/${blogId}/atoms`);
      if (response.ok) {
        const data = (await response.json()) as { atoms: Atom[] };
        // Reverse to show newest first (matches WebSocket prepend behavior)
        setAtoms((data.atoms || []).reverse());
      }
    } catch (error) {
      console.error('Failed to fetch initial atoms:', error);
    }
  };

  const connectWebSocket = () => {
    // Determine WebSocket protocol (ws:// or wss://)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/liveblog/${blogId}/websocket`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('Connected - Live updates enabled');
        // Fetch full atom list to ensure we have all atoms including any missed during disconnection
        fetchInitialAtoms();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'new_atom') {
            // Add the new atom to the top of the list
            setAtoms((prev) => [message.atom, ...prev]);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Check if we're in development mode (localhost:3000 = Next.js dev server)
        if (window.location.port === '3000') {
          setConnectionStatus('Development mode - WebSockets require Workers runtime');
          setIsConnected(false);
        } else {
          setConnectionStatus('Connection error');
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        setIsConnected(false);

        // Don't attempt to reconnect if we're in dev mode or got a 426 (Upgrade Required)
        if (window.location.port === '3000' || event.code === 1002) {
          setConnectionStatus('Development mode - Use `npm run preview` for WebSockets');
        } else {
          setConnectionStatus('Disconnected - Attempting to reconnect...');
          // Attempt to reconnect after 3 seconds
          setTimeout(() => {
            connectWebSocket();
          }, 3000);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setConnectionStatus('WebSocket not available in development mode');
      setIsConnected(false);
    }
  };

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
