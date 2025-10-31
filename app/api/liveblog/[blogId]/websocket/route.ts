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
 * GET /api/liveblog/[blogId]/websocket
 * WebSocket upgrade endpoint
 *
 * Note: WebSocket upgrades only work in the Cloudflare Workers runtime.
 * Use `npm run preview` or deploy to Cloudflare to test WebSocket functionality.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blogId: string }> }
) {
  const { blogId } = await params;

  // Check if this is a WebSocket upgrade request
  const upgradeHeader = request.headers.get('Upgrade');

  // Try to get the Cloudflare environment (only available in Workers runtime)
  const env = (request as CloudflareRequest).env;

  if (env?.LIVEBLOG && upgradeHeader === 'websocket') {
    // We're in the Cloudflare Workers environment with a WebSocket upgrade request
    try {
      const id = env.LIVEBLOG.idFromName(blogId);
      const stub = env.LIVEBLOG.get(id);
      return stub.fetch(request);
    } catch (error) {
      console.error('Error connecting to Durable Object WebSocket:', error);
      return new Response('Failed to connect to WebSocket', { status: 500 });
    }
  }

  // Development mode: WebSocket not supported in Next.js dev server
  if (upgradeHeader === 'websocket') {
    console.warn('⚠️  WebSocket upgrade requested in development mode');
    console.warn('   WebSockets require Cloudflare Workers runtime');
    console.warn('   Use `npm run preview` to test WebSocket functionality');

    return new Response(
      'WebSocket connections require Cloudflare Workers runtime. Use `npm run preview` or deploy to Cloudflare.',
      { status: 426 } // 426 Upgrade Required
    );
  }

  // Regular HTTP request to WebSocket endpoint
  return NextResponse.json({
    error: 'This endpoint is for WebSocket connections only',
    _devMode: !env?.LIVEBLOG,
    _message:
      'WebSocket connections require Cloudflare Workers runtime. Use `npm run preview` or deploy to Cloudflare.',
  });
}
