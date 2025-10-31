'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [blogId, setBlogId] = useState('');

  const handleCreateBlog = () => {
    // Generate a random blog ID
    const randomId = Math.random().toString(36).substring(2, 15);
    router.push(`/blog/${randomId}`);
  };

  const handleGoToBlog = (e: React.FormEvent) => {
    e.preventDefault();
    if (blogId.trim()) {
      router.push(`/blog/${blogId.trim()}`);
    }
  };

  const exampleBlogs = [
    { id: 'breaking-news', name: 'Breaking News' },
    { id: 'sports-live', name: 'Sports Live' },
    { id: 'tech-updates', name: 'Tech Updates' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Live Blog
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-2">
            Real-time blogging powered by Cloudflare Durable Objects
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Write once, broadcast instantly to all readers via WebSockets
          </p>
        </div>

        {/* Main Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
          <div className="space-y-6">
            {/* Create New Blog */}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Start a New Live Blog
              </h2>
              <button
                onClick={handleCreateBlog}
                className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg"
              >
                Create Random Blog
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  or
                </span>
              </div>
            </div>

            {/* Go to Existing Blog */}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Go to Existing Blog
              </h2>
              <form onSubmit={handleGoToBlog} className="flex gap-2">
                <input
                  type="text"
                  value={blogId}
                  onChange={(e) => setBlogId(e.target.value)}
                  placeholder="Enter blog ID..."
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold"
                >
                  Go
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Example Blogs */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Example Blogs
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {exampleBlogs.map((blog) => (
              <Link
                key={blog.id}
                href={`/blog/${blog.id}`}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors text-center"
              >
                <div className="font-semibold text-gray-900 dark:text-white mb-1">
                  {blog.name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {blog.id}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
            How It Works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✍️</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Author Writes
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Create and publish posts from the author interface
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Instant Broadcast
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                WebSocket push updates to all connected readers
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">👥</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Readers See
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Posts appear instantly without page refresh
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 text-gray-500 dark:text-gray-400 text-sm">
          <p>
            Built with Next.js 15, Cloudflare Workers, and Durable Objects
          </p>
        </footer>
      </div>
    </div>
  );
}
