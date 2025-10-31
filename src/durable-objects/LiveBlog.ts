import { DurableObject } from 'cloudflare:workers';

// Atom: A single post in a live blog
export interface Atom {
  id: string;
  content: string;
  timestamp: number;
  author?: string;
}

// LiveBlog metadata
interface LiveBlogMetadata {
  id: string;
  name: string;
  createdAt: number;
}

/**
 * LiveBlog Durable Object
 *
 * WHAT IS A DURABLE OBJECT?
 * Durable Objects are Cloudflare's solution for stateful serverless computing.
 * Each instance:
 * - Has a unique ID (we use blog IDs like "breaking-news")
 * - Runs in a single location globally for strong consistency
 * - Has built-in persistent storage (key-value)
 * - Can handle WebSocket connections
 *
 * WHY DURABLE OBJECTS FOR LIVE BLOGS?
 * - All readers for a blog connect to the SAME instance
 * - Posts are stored reliably and can be retrieved after restarts
 * - WebSocket broadcasts reach all readers instantly
 * - No need for external databases or message queues
 *
 * WEBSOCKET HIBERNATION:
 * This DO uses WebSocket hibernation to efficiently manage thousands of
 * connections without consuming memory when idle. Connections "wake up"
 * the DO only when needed (e.g., when broadcasting new posts).
 */
export class LiveBlog extends DurableObject {
  /**
   * Tracks all active WebSocket connections from readers.
   * Key: WebSocket object
   * Value: Session metadata (session ID)
   *
   * NOTE: This map is reconstructed from hibernated connections on each wakeup.
   */
  sessions: Map<WebSocket, { id: string }>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.sessions = new Map();

    /**
     * CRITICAL: Restore hibernated WebSocket connections
     *
     * When a Durable Object hibernates (to save memory), active WebSocket
     * connections remain open but the DO instance is destroyed. When the DO
     * wakes up (e.g., to broadcast a new post), we need to restore the
     * connection metadata from serialized attachments.
     *
     * This ensures we can still send messages to all connected readers even
     * after hibernation.
     */
    this.ctx.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment();
      if (attachment) {
        this.sessions.set(ws, { ...attachment });
      }
    });

    /**
     * WebSocket Auto-Response for Keep-Alive
     *
     * This tells Cloudflare to automatically respond to "ping" messages with
     * "pong" WITHOUT waking up the Durable Object. This keeps connections alive
     * without any memory cost when idle.
     *
     * Benefits:
     * - Connections stay alive during idle periods
     * - No CPU/memory cost for ping/pong
     * - DO only wakes when real messages arrive
     */
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle WebSocket upgrade for readers
    if (path.endsWith('/websocket')) {
      return this.handleWebSocketUpgrade(request);
    }

    // Handle getting all atoms (initial load)
    if (path.endsWith('/atoms') && request.method === 'GET') {
      return this.handleGetAtoms();
    }

    // Handle creating a new atom (from author)
    if (path.endsWith('/atoms') && request.method === 'POST') {
      return this.handleCreateAtom(request);
    }

    // Handle getting blog metadata
    if (path.endsWith('/metadata') && request.method === 'GET') {
      return this.handleGetMetadata();
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket upgrade request from a reader
   *
   * WEBSOCKET UPGRADE FLOW:
   * 1. Client sends HTTP request with "Upgrade: websocket" header
   * 2. We create a WebSocketPair (two connected WebSockets)
   * 3. One WebSocket goes to the client (browser)
   * 4. Other WebSocket stays with the Durable Object
   * 5. We accept the DO-side WebSocket with hibernation support
   *
   * HIBERNATION SETUP:
   * - serializeAttachment() saves session data that survives hibernation
   * - When DO wakes up, deserializeAttachment() restores this data
   * - This allows the connection to persist even when DO is destroyed
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    if (request.method !== 'GET') {
      return new Response('Expected GET method', { status: 400 });
    }

    /**
     * WebSocketPair: Creates two connected WebSockets
     * - client: Returned to the browser
     * - server: Kept by the Durable Object
     * - Messages sent to one are received by the other
     */
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    /**
     * CRITICAL: Accept WebSocket with hibernation
     *
     * this.ctx.acceptWebSocket() tells Cloudflare:
     * "This WebSocket is managed by this Durable Object with hibernation"
     *
     * What happens:
     * - Connection stays open even when DO hibernates
     * - DO wakes up to handle: webSocketMessage, webSocketClose, webSocketError
     * - DO can send messages anytime via server.send()
     */
    this.ctx.acceptWebSocket(server);

    // Generate a unique session ID for tracking this reader
    const sessionId = crypto.randomUUID();

    /**
     * Serialize attachment: Save data that survives hibernation
     *
     * This data is attached to the WebSocket and will be available
     * even after the DO instance is destroyed and recreated.
     * Retrieved via ws.deserializeAttachment() in the constructor.
     */
    server.serializeAttachment({ id: sessionId });

    // Track the session in memory (rebuilt on each wakeup)
    this.sessions.set(server, { id: sessionId });

    console.log(`Reader connected: ${sessionId}. Total readers: ${this.sessions.size}`);

    /**
     * Return 101 Switching Protocols with client WebSocket
     *
     * The client WebSocket is passed to the browser, completing the upgrade.
     * The server WebSocket stays with the DO for sending broadcasts.
     */
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle getting all atoms (for initial page load)
   */
  private async handleGetAtoms(): Promise<Response> {
    const atoms = await this.getAllAtoms();
    return new Response(JSON.stringify({ atoms }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle creating a new atom from an author
   */
  private async handleCreateAtom(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as { content?: string; author?: string };
      const { content, author } = body;

      if (!content || typeof content !== 'string') {
        return new Response(JSON.stringify({ error: 'Content is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Create the atom
      const atom: Atom = {
        id: crypto.randomUUID(),
        content: content.trim(),
        timestamp: Date.now(),
        author: author || 'Anonymous',
      };

      // Store the atom
      await this.storeAtom(atom);

      // Broadcast to all connected readers
      this.broadcastAtom(atom);

      console.log(`Atom created: ${atom.id} by ${atom.author}. Broadcasting to ${this.sessions.size} readers.`);

      return new Response(JSON.stringify({ success: true, atom }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error creating atom:', error);
      return new Response(JSON.stringify({ error: 'Failed to create atom' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Handle getting blog metadata
   */
  private async handleGetMetadata(): Promise<Response> {
    let metadata = await this.ctx.storage.get<LiveBlogMetadata>('metadata');

    if (!metadata) {
      // Initialize metadata if it doesn't exist
      metadata = {
        id: this.ctx.id.toString(),
        name: `Live Blog ${this.ctx.id.toString().substring(0, 8)}`,
        createdAt: Date.now(),
      };
      await this.ctx.storage.put('metadata', metadata);
    }

    return new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Store an atom in durable storage
   *
   * DURABLE STORAGE:
   * this.ctx.storage is a key-value store that:
   * - Persists across Durable Object instance restarts
   * - Is strongly consistent (reads see latest writes)
   * - Is automatically replicated by Cloudflare
   * - Survives even if the DO is evicted from memory
   *
   * In this implementation:
   * - We store all atoms in a single key ('atoms')
   * - This is simple but limits to ~128KB of posts
   * - For production, consider pagination or individual atom keys
   */
  private async storeAtom(atom: Atom): Promise<void> {
    // Get existing atoms
    const atoms = await this.getAllAtoms();

    // Add new atom
    atoms.push(atom);

    /**
     * Store updated atoms list in Durable Storage
     *
     * this.ctx.storage.put() is transactional and durable.
     * Once this promise resolves, the data is safely stored.
     */
    await this.ctx.storage.put('atoms', atoms);
  }

  /**
   * Get all atoms from storage
   *
   * DURABLE STORAGE READ:
   * - If data exists, returns the stored value
   * - If key doesn't exist, returns undefined
   * - Reads are strongly consistent (always see latest write)
   */
  private async getAllAtoms(): Promise<Atom[]> {
    const atoms = await this.ctx.storage.get<Atom[]>('atoms');
    return atoms || [];
  }

  /**
   * Broadcast a new atom to all connected readers
   *
   * WEBSOCKET BROADCASTING WITH HIBERNATION:
   *
   * How it works:
   * 1. This method is called when a new post is created
   * 2. The DO wakes up (if hibernated)
   * 3. We iterate over all WebSocket connections
   * 4. Send the new atom to each reader
   * 5. DO can hibernate again after all messages are sent
   *
   * Key points:
   * - All readers get the message in real-time
   * - Failed sends are caught and connections cleaned up
   * - This happens on the same DO instance for strong consistency
   * - No external message queue or pub/sub needed
   */
  private broadcastAtom(atom: Atom): void {
    const message = JSON.stringify({
      type: 'new_atom',
      atom,
    });

    /**
     * Send to all connected readers
     *
     * this.sessions contains all active WebSocket connections.
     * Even if the DO was hibernated, the connections are restored
     * and ready to receive messages.
     */
    this.sessions.forEach((session, ws) => {
      try {
        ws.send(message);
      } catch (error) {
        console.error(`Failed to send to session ${session.id}:`, error);
        // Remove failed connection
        this.sessions.delete(ws);
      }
    });
  }

  /**
   * Handle WebSocket messages (optional - for future interactivity)
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session) {
      console.error('Received message from unknown session');
      return;
    }

    // For now, we don't expect messages from readers
    // Could be used for reactions, comments, etc. in the future
    console.log(`Message from reader ${session.id}:`, message);
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (session) {
      console.log(
        `Reader disconnected: ${session.id}. ` +
        `Code: ${code}, Reason: ${reason || 'none'}, Clean: ${wasClean}. ` +
        `Total readers: ${this.sessions.size - 1}`
      );
      this.sessions.delete(ws);
    }
    ws.close(code, 'LiveBlog Durable Object is closing WebSocket');
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const session = this.sessions.get(ws);
    console.error(`WebSocket error for session ${session?.id}:`, error);
    this.sessions.delete(ws);
  }
}
