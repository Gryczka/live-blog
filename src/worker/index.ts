/**
 * Custom Worker Handler for LiveBlog
 *
 * CLOUDFLARE WORKERS:
 * Workers are JavaScript/TypeScript code that runs on Cloudflare's edge network.
 * They intercept HTTP requests and can:
 * - Modify requests/responses
 * - Route to different backends
 * - Access Cloudflare services (Durable Objects, KV, R2, etc.)
 * - Run at the edge, close to users
 *
 * WHY A CUSTOM WORKER?
 * By default, OpenNext handles all Next.js requests. But we want to:
 * 1. Intercept /api/liveblog/* requests BEFORE they reach Next.js
 * 2. Route them directly to Durable Objects for optimal performance
 * 3. Pass all other requests to Next.js via OpenNext
 *
 * This gives us the best of both worlds:
 * - Next.js App Router for UI (SSR, Server Components, etc.)
 * - Direct Durable Object access for real-time features
 */

import { LiveBlog } from '../durable-objects/LiveBlog';

/**
 * Re-export the LiveBlog Durable Object
 *
 * IMPORTANT: Durable Objects must be exported from the Worker
 * so Wrangler can register them. The wrangler.jsonc config
 * references this export:
 *
 * "durable_objects": {
 *   "bindings": [{
 *     "name": "LIVEBLOG",           // Binding name (env.LIVEBLOG)
 *     "class_name": "LiveBlog"      // This export (class name)
 *     // No script_name needed - DO is in this worker
 *   }]
 * }
 */
export { LiveBlog };

/**
 * Environment interface with Durable Object bindings
 *
 * BINDINGS:
 * Cloudflare bindings connect Workers to other Cloudflare services.
 * They appear as properties on the 'env' object passed to fetch().
 *
 * LIVEBLOG: A Durable Object namespace
 * - Acts as a factory for Durable Object instances
 * - env.LIVEBLOG.idFromName(name) gets/creates a DO by name
 * - env.LIVEBLOG.get(id) returns a stub to call the DO
 */
export interface Env {
  LIVEBLOG: DurableObjectNamespace<LiveBlog>;
  ASSETS: unknown;
  [key: string]: unknown;
}

/**
 * Main fetch handler
 */
const handler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route to LiveBlog Durable Object for /api/liveblog/* paths
    if (url.pathname.startsWith('/api/liveblog/')) {
      return handleLiveBlogRequest(request, env, url);
    }

    // For all other requests, use the OpenNext handler
    // We'll import this dynamically to avoid circular dependencies
    try {
      const openNextHandler = await import('../../.open-next/worker.js');
      return openNextHandler.default.fetch(request, env, ctx);
    } catch (error) {
      console.error('Error loading OpenNext handler:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

export default handler;

/**
 * Handle requests to the LiveBlog Durable Object
 *
 * URL format: /api/liveblog/{blogId}/{action}
 * - /api/liveblog/{blogId}/websocket - WebSocket upgrade for readers
 * - /api/liveblog/{blogId}/atoms - GET all atoms, POST new atom
 * - /api/liveblog/{blogId}/metadata - GET blog metadata
 *
 * DURABLE OBJECT ROUTING:
 * This function demonstrates the key pattern for routing to Durable Objects:
 *
 * 1. Extract an identifier from the request (blogId)
 * 2. Get a Durable Object ID using idFromName() or idFromString()
 * 3. Get a "stub" to that DO instance
 * 4. Call stub.fetch() to forward the request to the DO
 *
 * WHY idFromName()?
 * - Deterministic: Same name always maps to same DO instance
 * - Global: Works across all Cloudflare data centers
 * - Consistent: All requests for "breaking-news" go to THE SAME instance
 *
 * This is what makes Durable Objects "durable" - state is coordinated
 * through a single instance globally.
 */
async function handleLiveBlogRequest(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  // Parse the blog ID from the URL path
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Example: /api/liveblog/breaking-news/atoms
  // pathParts = ['api', 'liveblog', 'breaking-news', 'atoms']

  if (pathParts.length < 3) {
    return new Response('Invalid LiveBlog URL', { status: 400 });
  }

  const blogId = pathParts[2]; // The blog ID (e.g., "breaking-news")

  if (!blogId) {
    return new Response('Blog ID is required', { status: 400 });
  }

  /**
   * Get or create the Durable Object instance for this blog
   *
   * CRITICAL CONCEPT: Consistent Hashing with Named IDs
   *
   * env.LIVEBLOG.idFromName(blogId) returns a Durable Object ID.
   * - Same blogId ALWAYS returns the same DO ID
   * - This ID maps to a single DO instance globally
   * - All requests for this blog go to that one instance
   *
   * This is how we ensure:
   * - All readers for "breaking-news" connect to the same DO
   * - WebSocket broadcasts reach all readers
   * - Storage is consistent (no race conditions)
   */
  const id = env.LIVEBLOG.idFromName(blogId);

  /**
   * Get a stub to the Durable Object
   *
   * A stub is a client for calling the DO. It has a fetch() method
   * that forwards requests to the DO's fetch() handler.
   *
   * If the DO instance doesn't exist yet, Cloudflare creates it.
   * If it exists but is hibernated, Cloudflare wakes it up.
   */
  const stub = env.LIVEBLOG.get(id);

  /**
   * Forward the request to the Durable Object
   *
   * This calls the LiveBlog.fetch() method in LiveBlog.ts.
   * The DO handles the specific action (websocket, atoms, metadata).
   *
   * The request URL, headers, body, etc. are all passed through.
   */
  return stub.fetch(request);
}
