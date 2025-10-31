import { NextRequest, NextResponse } from 'next/server';

// This is the environment interface for Cloudflare Workers
interface CloudflareEnv {
  LIVEBLOG?: DurableObjectNamespace;
}

// Extended NextRequest with Cloudflare env
interface CloudflareRequest extends NextRequest {
  env?: CloudflareEnv;
}

/**
 * GET /api/liveblog/[blogId]/atoms
 * Get all atoms for a blog
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blogId: string }> }
) {
  const { blogId } = await params;

  // Try to get the Cloudflare environment (only available in Workers runtime)
  const env = (request as CloudflareRequest).env;

  if (env?.LIVEBLOG) {
    // We're in the Cloudflare Workers environment
    try {
      const id = env.LIVEBLOG.idFromName(blogId);
      const stub = env.LIVEBLOG.get(id);
      return stub.fetch(request);
    } catch (error) {
      console.error('Error fetching from Durable Object:', error);
      return NextResponse.json({ error: 'Failed to fetch atoms' }, { status: 500 });
    }
  }

  // Development mode fallback: return mock data
  console.warn('⚠️  Running in development mode without Cloudflare Workers runtime');
  console.warn('   Use `npm run preview` to test with Durable Objects');

  // Return empty atoms list for dev mode
  return NextResponse.json({
    atoms: [],
    _devMode: true,
    _message: 'Running in development mode. Use `npm run preview` for full functionality.',
  });
}

/**
 * POST /api/liveblog/[blogId]/atoms
 * Create a new atom
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ blogId: string }> }
) {
  const { blogId } = await params;

  // Try to get the Cloudflare environment (only available in Workers runtime)
  const env = (request as CloudflareRequest).env;

  if (env?.LIVEBLOG) {
    // We're in the Cloudflare Workers environment
    try {
      const id = env.LIVEBLOG.idFromName(blogId);
      const stub = env.LIVEBLOG.get(id);
      return stub.fetch(request);
    } catch (error) {
      console.error('Error posting to Durable Object:', error);
      return NextResponse.json({ error: 'Failed to create atom' }, { status: 500 });
    }
  }

  // Development mode fallback: simulate success
  console.warn('⚠️  Running in development mode without Cloudflare Workers runtime');
  console.warn('   Use `npm run preview` to test with Durable Objects');

  try {
    const body = (await request.json()) as { content?: string; author?: string };
    const { content, author } = body;

    // Return a mock atom
    const mockAtom = {
      id: crypto.randomUUID(),
      content,
      author: author || 'Anonymous',
      timestamp: Date.now(),
    };

    return NextResponse.json({
      success: true,
      atom: mockAtom,
      _devMode: true,
      _message: 'Mock atom created in dev mode. Use `npm run preview` for full functionality.',
    });
  } catch (error) {
    console.error('Error in dev mode POST:', error);
    return NextResponse.json({ error: 'Failed to create atom' }, { status: 500 });
  }
}
