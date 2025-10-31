# Cloudflare Developer Platform Concepts

This guide explains the key Cloudflare concepts used in the Live Blog project. Use this as a learning resource to understand how Cloudflare's edge computing platform works.

## Table of Contents

1. [Cloudflare Workers](#cloudflare-workers)
2. [Durable Objects](#durable-objects)
3. [WebSocket Hibernation](#websocket-hibernation)
4. [Durable Storage](#durable-storage)
5. [Bindings](#bindings)
6. [Integration with Next.js](#integration-with-nextjs)

---

## Cloudflare Workers

### What are Workers?

Cloudflare Workers are serverless functions that run on Cloudflare's global edge network. They execute JavaScript/TypeScript code in response to HTTP requests.

### Key Characteristics

- **Edge Execution**: Run in Cloudflare's data centers worldwide (300+ locations)
- **V8 Isolates**: Lightweight execution environment (faster cold starts than containers)
- **Event-Driven**: Triggered by HTTP requests
- **No Cold Starts**: Sub-millisecond startup time
- **Request/Response Model**: Standard Web APIs (fetch, Request, Response)

### Basic Worker Structure

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Your code here
    return new Response('Hello from the edge!');
  }
}
```

### In This Project

Our custom worker ([src/worker/index.ts](src/worker/index.ts)) acts as a router:
- Intercepts `/api/liveblog/*` requests → routes to Durable Objects
- All other requests → forwards to OpenNext (Next.js)

This hybrid approach gives us Next.js features PLUS direct access to Cloudflare primitives.

---

## Durable Objects

### What are Durable Objects?

Durable Objects (DOs) are **stateful** serverless objects that provide:
- Strong consistency
- Persistent storage
- WebSocket support
- Global coordination

Think of them as "mini servers" that live on the edge, but with important differences.

### Key Concepts

#### 1. Single Instance Per ID

```typescript
// Both requests go to THE SAME Durable Object instance
const id1 = env.LIVEBLOG.idFromName('breaking-news');
const id2 = env.LIVEBLOG.idFromName('breaking-news');
// id1 === id2 ✓
```

**Why this matters**: All requests for a given ID are coordinated through a single instance. This eliminates race conditions and provides strong consistency.

#### 2. Unique ID Per Object

Each Durable Object instance has a unique ID that determines:
- Which physical Cloudflare server it runs on
- How requests are routed to it
- Storage isolation

#### 3. Named IDs vs Random IDs

```typescript
// Named IDs: Deterministic (same name → same DO)
const id = env.LIVEBLOG.idFromName('my-blog');

// Random IDs: Generated (for ephemeral objects)
const id = env.LIVEBLOG.newUniqueId();
```

**In this project**: We use named IDs so blog ID "breaking-news" always maps to the same DO.

### Durable Object Lifecycle

```
1. Request arrives at Worker
2. Worker calls env.LIVEBLOG.idFromName('blog-id')
3. Worker gets stub: env.LIVEBLOG.get(id)
4. Worker calls stub.fetch(request)
   ↓
5. Cloudflare routes to the DO instance (creates if needed)
6. DO's fetch() method handles the request
7. Response returned to Worker → Client
```

### Benefits for Live Blogs

- **All readers connect to same DO**: Enables real-time WebSocket broadcasts
- **Posts stored in DO storage**: Persistent, consistent data
- **No external coordination**: No Redis, no database, no message queue
- **Global consistency**: Same state everywhere

### Code Example

```typescript
// src/durable-objects/LiveBlog.ts
export class LiveBlog extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    // This code runs in a single instance per blog
    // All readers for this blog hit THIS instance
    return new Response('Hello from the DO!');
  }
}
```

---

## WebSocket Hibernation

### The Problem

Traditional WebSockets require keeping a server in memory for each connection. With thousands of idle connections, memory usage explodes.

### The Solution: Hibernation

Cloudflare's WebSocket hibernation allows Durable Objects to:
1. Accept WebSocket connections
2. Serialize connection state
3. **Hibernate** (destroy the DO instance, free memory)
4. **Wake up** automatically when messages arrive
5. Restore connection state and process messages

### How It Works

#### Step 1: Accept WebSocket with Hibernation

```typescript
// Create WebSocket pair
const pair = new WebSocketPair();
const [client, server] = Object.values(pair);

// CRITICAL: Use ctx.acceptWebSocket() for hibernation support
this.ctx.acceptWebSocket(server);

// Return client to browser
return new Response(null, { status: 101, webSocket: client });
```

#### Step 2: Serialize State

```typescript
// Save data that survives hibernation
server.serializeAttachment({ userId: '123', roomId: 'abc' });
```

#### Step 3: Restore State on Wakeup

```typescript
constructor(ctx: DurableObjectState, env: Env) {
  super(ctx, env);

  // Restore all hibernated WebSocket connections
  this.ctx.getWebSockets().forEach((ws) => {
    const attachment = ws.deserializeAttachment();
    // attachment = { userId: '123', roomId: 'abc' }
    this.sessions.set(ws, attachment);
  });
}
```

#### Step 4: Auto-Response (Optional)

```typescript
// Respond to pings WITHOUT waking the DO
this.ctx.setWebSocketAutoResponse(
  new WebSocketRequestResponsePair('ping', 'pong')
);
```

### Lifecycle Example

```
1. Reader connects to WebSocket
2. DO accepts connection and serializes session data
3. DO has no activity → Cloudflare hibernates the DO
4. Connection stays open, but DO instance is destroyed (memory freed)

   [Time passes... connection is idle...]

5. Author publishes a new post
6. POST request arrives at the DO
7. Cloudflare wakes up the DO instance
8. Constructor runs, restoring WebSocket connections
9. DO broadcasts to all connections
10. Response sent, DO hibernates again
```

### Benefits

- **Memory Efficiency**: Idle connections consume ~0 memory
- **Cost Savings**: Only pay when DO is active
- **Scalability**: Support thousands of connections per DO
- **Automatic**: Cloudflare handles hibernation/wakeup

### In This Project

See [src/durable-objects/LiveBlog.ts:55-88](src/durable-objects/LiveBlog.ts#L55-L88) for the complete implementation.

---

## Durable Storage

### What is Durable Storage?

Every Durable Object has built-in key-value storage that:
- Persists across DO instance restarts
- Is strongly consistent
- Is automatically replicated
- Survives even if the DO is evicted from memory

### API

```typescript
// Write
await this.ctx.storage.put('key', { data: 'value' });

// Read
const value = await this.ctx.storage.get('key');

// Delete
await this.ctx.storage.delete('key');

// List keys
const keys = await this.ctx.storage.list();

// Transactions
await this.ctx.storage.transaction(async (txn) => {
  const value = await txn.get('counter');
  await txn.put('counter', value + 1);
});
```

### Storage Limits

- **Value size**: Up to 128 KB per key
- **Total storage**: Up to 50 GB per DO instance
- **Operations**: Unlimited reads/writes

### In This Project

We store all blog posts (atoms) in a single key:

```typescript
// Store atoms
private async storeAtom(atom: Atom): Promise<void> {
  const atoms = await this.getAllAtoms();
  atoms.push(atom);
  await this.ctx.storage.put('atoms', atoms);
}

// Retrieve atoms
private async getAllAtoms(): Promise<Atom[]> {
  const atoms = await this.ctx.storage.get<Atom[]>('atoms');
  return atoms || [];
}
```

**Note**: For production, consider pagination or storing each atom individually to avoid the 128KB limit.

### Consistency Guarantees

- **Single-instance writes**: All writes go through the DO instance
- **Linearizable**: Reads always see the latest write
- **Transactional**: Multi-key updates are atomic

---

## Bindings

### What are Bindings?

Bindings connect Workers to Cloudflare services. They appear as properties on the `env` object passed to `fetch()`.

### Types of Bindings

```typescript
export interface Env {
  // Durable Object namespace
  LIVEBLOG: DurableObjectNamespace<LiveBlog>;

  // KV namespace
  MY_KV: KVNamespace;

  // R2 bucket
  MY_BUCKET: R2Bucket;

  // Environment variables
  API_KEY: string;

  // Service bindings (call other Workers)
  OTHER_WORKER: Fetcher;
}
```

### Durable Object Bindings

Configured in `wrangler.jsonc`:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "LIVEBLOG",           // env.LIVEBLOG (binding name)
        "class_name": "LiveBlog"      // Exported class name from this worker
        // Note: No script_name needed when DO is in the same worker
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",                    // Migration version identifier
      "new_classes": ["LiveBlog"]     // New Durable Object classes
    }
  ]
}
```

**Important Configuration Rules:**

1. **No `script_name` for same-worker DOs**: When the Durable Object is defined in the same worker, omit the `script_name` field. Only include it when referencing a Durable Object from a different worker script.

2. **Migrations are required**: You must define a `migrations` section when first creating a Durable Object. This tells Cloudflare you're adding a new DO class.

3. **Migration tags**: The `tag` can be any string and is used to track schema versions. Common patterns:
   - "v1", "v2", "v3" for simple versioning
   - Timestamps: "2024-01-15"
   - Semantic versions: "1.0.0"

### Durable Object Migrations

Migrations are how you make changes to your Durable Objects over time. They ensure that existing DO instances can be safely updated.

#### Common Migration Types

```jsonc
{
  "migrations": [
    // Initial creation
    {
      "tag": "v1",
      "new_classes": ["LiveBlog"]
    },

    // Adding a new DO class later
    {
      "tag": "v2",
      "new_classes": ["AnalyticsDO"]
    },

    // Renaming a class
    {
      "tag": "v3",
      "renamed_classes": [
        { "from": "LiveBlog", "to": "BlogDO" }
      ]
    },

    // Removing a class (deletes all instances!)
    {
      "tag": "v4",
      "deleted_classes": ["OldFeatureDO"]
    }
  ]
}
```

**Important**: Once deployed to production, never modify or remove old migration entries. Always add new ones. See the [official migration guide](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) for detailed rules.

### Using Bindings

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Get a Durable Object ID
    const id = env.LIVEBLOG.idFromName('my-blog');

    // Get a stub to call the DO
    const stub = env.LIVEBLOG.get(id);

    // Call the DO
    return stub.fetch(request);
  }
}
```

### DurableObjectNamespace API

```typescript
// Create ID from name (deterministic)
const id = env.LIVEBLOG.idFromName('my-blog');

// Create ID from string (for UUIDs)
const id = env.LIVEBLOG.idFromString('550e8400-e29b-41d4-a716-446655440000');

// Create new unique ID
const id = env.LIVEBLOG.newUniqueId();

// Get stub to call DO
const stub = env.LIVEBLOG.get(id);

// Call DO's fetch method
const response = await stub.fetch(request);
```

---

## Integration with Next.js

### The Challenge

Next.js doesn't natively support Cloudflare Workers or Durable Objects. How do we combine them?

### The Solution: OpenNext + Custom Worker

**OpenNext** is an adapter that makes Next.js work on Cloudflare Workers. We extend it with a custom worker.

### Architecture

```
Request
  ↓
Custom Worker (src/worker/index.ts)
  ↓
  ├─→ /api/liveblog/* → Durable Objects (Real-time)
  │
  └─→ /* → OpenNext → Next.js (UI, SSR, API routes)
```

### Custom Worker Code

```typescript
// src/worker/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route to Durable Objects
    if (url.pathname.startsWith('/api/liveblog/')) {
      const id = env.LIVEBLOG.idFromName(blogId);
      const stub = env.LIVEBLOG.get(id);
      return stub.fetch(request);
    }

    // Route to Next.js
    const openNextHandler = await import('../../.open-next/worker.js');
    return openNextHandler.default.fetch(request, env, ctx);
  }
}
```

### Configuration

In `wrangler.jsonc`:

```jsonc
{
  "main": "src/worker/index.ts",  // Custom worker is entry point
  "assets": {
    "directory": ".open-next/assets"
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "LIVEBLOG",
        "class_name": "LiveBlog",
        "script_name": "live-blog"
      }
    ]
  }
}
```

### What This Gives You

- **Full Next.js features**: App Router, Server Components, SSR, SSG
- **Direct DO access**: No HTTP overhead for real-time features
- **Best of both worlds**: Static UI + dynamic real-time data
- **Edge deployment**: Runs globally on Cloudflare's network

### Development Modes

#### Next.js Dev Mode (`npm run dev`)

- Fast hot reload
- No Durable Objects or WebSockets
- Mock API responses
- Great for UI development

#### Workers Preview (`npm run preview`)

- Full Cloudflare Workers runtime
- Real Durable Objects and WebSockets
- Slower (requires rebuild)
- Required for testing real-time features

---

## Common Patterns

### Pattern 1: Fan-Out Broadcasting

```typescript
// Store WebSocket connections
sessions: Map<WebSocket, SessionData> = new Map();

// Broadcast to all
broadcast(message: string) {
  this.sessions.forEach((session, ws) => {
    try {
      ws.send(message);
    } catch (error) {
      this.sessions.delete(ws);
    }
  });
}
```

**Use case**: Live blogs, chat rooms, collaborative editing

### Pattern 2: Rate Limiting

```typescript
async handleRequest(userId: string): Promise<Response> {
  const key = `rate:${userId}`;
  const count = await this.ctx.storage.get<number>(key) || 0;

  if (count > 100) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  await this.ctx.storage.put(key, count + 1);
  return new Response('OK');
}
```

**Use case**: API rate limiting, spam prevention

### Pattern 3: Atomic Counters

```typescript
async increment(): Promise<number> {
  let value = await this.ctx.storage.get<number>('counter') || 0;
  value++;
  await this.ctx.storage.put('counter', value);
  return value;
}
```

**Use case**: View counts, vote tallies, sequence IDs

---

## Best Practices

### 1. Always Restore Hibernated WebSockets

```typescript
constructor(ctx: DurableObjectState, env: Env) {
  super(ctx, env);

  // CRITICAL: Restore connections
  this.ctx.getWebSockets().forEach((ws) => {
    const attachment = ws.deserializeAttachment();
    if (attachment) {
      this.sessions.set(ws, attachment);
    }
  });
}
```

### 2. Use Named IDs for Deterministic Routing

```typescript
// Good: Same blog always maps to same DO
const id = env.LIVEBLOG.idFromName(blogId);

// Avoid: Random IDs make it hard to find the DO later
const id = env.LIVEBLOG.newUniqueId();
```

### 3. Handle WebSocket Errors Gracefully

```typescript
broadcast(message: string) {
  this.sessions.forEach((session, ws) => {
    try {
      ws.send(message);
    } catch (error) {
      // Clean up failed connections
      console.error(`Failed to send to ${session.id}:`, error);
      this.sessions.delete(ws);
    }
  });
}
```

### 4. Keep Storage Values Small

- Individual values: < 128 KB
- Consider pagination for large lists
- Store large blobs in R2, references in DO storage

### 5. Use Transactions for Multi-Key Updates

```typescript
await this.ctx.storage.transaction(async (txn) => {
  const balance = await txn.get('balance');
  const count = await txn.get('count');
  await txn.put('balance', balance - 10);
  await txn.put('count', count + 1);
});
```

---

## Further Reading

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Durable Objects Docs](https://developers.cloudflare.com/durable-objects/)
- [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/api/websockets/)
- [OpenNext Cloudflare](https://opennext.js.org/cloudflare)
- [Next.js on Cloudflare](https://developers.cloudflare.com/pages/framework-guides/nextjs/)

---

## Questions?

For questions about this project, see the main [README.md](README.md).

For Cloudflare-specific questions, visit the [Cloudflare Community](https://community.cloudflare.com/).
