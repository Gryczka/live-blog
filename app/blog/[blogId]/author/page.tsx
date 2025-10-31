'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Atom {
  id: string;
  content: string;
  timestamp: number;
  author?: string;
}

export default function LiveBlogAuthor() {
  const params = useParams();
  const blogId = params?.blogId as string;

  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [recentAtoms, setRecentAtoms] = useState<Atom[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!blogId) return;
    fetchRecentAtoms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogId]);

  const fetchRecentAtoms = async () => {
    try {
      const response = await fetch(`/api/liveblog/${blogId}/atoms`);
      if (response.ok) {
        const data = (await response.json()) as { atoms: Atom[] };
        // Reverse to get newest first, then take top 5
        setRecentAtoms((data.atoms || []).reverse().slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to fetch recent atoms:', error);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      setPublishStatus({
        type: 'error',
        message: 'Content cannot be empty',
      });
      return;
    }

    setIsPublishing(true);
    setPublishStatus(null);

    try {
      const response = await fetch(`/api/liveblog/${blogId}/atoms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content.trim(),
          author: author.trim() || 'Anonymous',
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { success: boolean; atom: Atom };
        setPublishStatus({
          type: 'success',
          message: 'Published successfully! Readers will see this instantly.',
        });

        // Clear the form
        setContent('');

        // Add to recent atoms
        setRecentAtoms((prev) => [data.atom, ...prev.slice(0, 4)]);

        // Focus back on textarea
        textareaRef.current?.focus();

        // Clear success message after 3 seconds
        setTimeout(() => {
          setPublishStatus(null);
        }, 3000);
      } else {
        const error = (await response.json()) as { error: string };
        setPublishStatus({
          type: 'error',
          message: error.error || 'Failed to publish',
        });
      }
    } catch (error) {
      console.error('Publish error:', error);
      setPublishStatus({
        type: 'error',
        message: 'Network error. Please try again.',
      });
    } finally {
      setIsPublishing(false);
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
                Author: Live Blog {blogId}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Write and publish posts that readers see instantly
              </p>
            </div>
            <Link
              href={`/blog/${blogId}`}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              View as Reader
            </Link>
          </div>
        </div>

        {/* Development Mode Banner */}
        {typeof window !== 'undefined' && window.location.port === '3000' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800">
            <div className="max-w-4xl mx-auto px-4 py-2">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                Development Mode: Posts won&apos;t broadcast to readers in real-time. Use <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">npm run preview</code> for full functionality.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Publishing Form */}
          <div>
            <form onSubmit={handlePublish} className="space-y-4">
              <div>
                <label
                  htmlFor="author"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Author Name (optional)
                </label>
                <input
                  type="text"
                  id="author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="content"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Content
                </label>
                <textarea
                  ref={textareaRef}
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your live blog post..."
                  rows={10}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  required
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {content.length} characters
                </p>
              </div>

              <button
                type="submit"
                disabled={isPublishing || !content.trim()}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isPublishing ? 'Publishing...' : 'Publish to Live Blog'}
              </button>

              {publishStatus && (
                <div
                  className={`p-4 rounded-lg ${
                    publishStatus.type === 'success'
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                  }`}
                >
                  {publishStatus.message}
                </div>
              )}
            </form>

            {/* Instructions */}
            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                How it works
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                <li>• Write your content and click &quot;Publish&quot;</li>
                <li>• Posts appear instantly on the reader page</li>
                <li>• All connected readers receive updates in real-time</li>
                <li>• Uses WebSocket with Cloudflare Durable Objects</li>
              </ul>
            </div>
          </div>

          {/* Recent Posts */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Recent Posts
            </h2>
            {recentAtoms.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">
                No posts yet. Write your first one!
              </p>
            ) : (
              <div className="space-y-3">
                {recentAtoms.map((atom) => (
                  <div
                    key={atom.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">
                        {atom.author || 'Anonymous'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTimestamp(atom.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                      {atom.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
