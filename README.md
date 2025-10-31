# Live Blog

A real-time blogging platform powered by **Cloudflare Durable Objects** and **WebSockets**. Authors can write posts that are instantly broadcast to all connected readers without page refresh.

**This project serves as an educational introduction to Cloudflare's developer platform**, with comprehensive documentation, detailed code comments, and a complete [Cloudflare Concepts Guide](CLOUDFLARE_CONCEPTS.md).

## Features

- **Real-time Updates**: Posts appear instantly on reader pages via WebSocket connections
- **Durable Objects**: Each blog backed by a single Cloudflare Durable Object for consistency
- **WebSocket Hibernation**: Memory-efficient WebSocket connections that can hibernate
- **Next.js 15**: Modern React with App Router and Server Components
- **Cloudflare Workers**: Deployed on Cloudflare's global edge network
- **Tailwind CSS**: Beautiful, responsive UI with dark mode support
- **Educational Documentation**: Comprehensive guides and inline code comments for learning

## Cloudflare Concepts Explained

This project is an educational introduction to key Cloudflare Developer Platform concepts:

### Durable Objects

**What are they?** Durable Objects are stateful serverless objects that provide:
- **Strong consistency**: All requests for a given ID go to the same instance
- **Persistent storage**: Built-in key-value storage that survives instance restarts
- **Global coordination**: Perfect for managing shared state across multiple clients

**In this project:** Each blog ID maps to a single Durable Object instance. This ensures:
- All readers for a blog connect to the same DO
- Posts are stored reliably in DO storage
- WebSocket broadcasts reach all connected clients for that blog

**Code location:** [src/durable-objects/LiveBlog.ts](src/durable-objects/LiveBlog.ts)

### WebSocket Hibernation

**What is it?** WebSocket hibernation allows Durable Objects to:
- Accept WebSocket connections without staying in memory
- Automatically "wake up" when messages arrive
- Serialize connection state to survive hibernation

**Benefits:**
- **Memory efficiency**: Thousands of idle connections don't consume memory
- **Cost savings**: You only pay when the DO is actively processing
- **Automatic scaling**: Cloudflare handles the hibernation/wakeup lifecycle

**In this project:** Reader connections use hibernation:
```typescript
// Accept WebSocket with hibernation support
this.ctx.acceptWebSocket(server);

// Serialize session data for hibernation
server.serializeAttachment({ id: sessionId });

// Auto-respond to pings without waking the DO
this.ctx.setWebSocketAutoResponse(
  new WebSocketRequestResponsePair('ping', 'pong')
);
```

When a new post is published, the DO wakes up, broadcasts to all connections, then hibernates again.

**Code location:** [src/durable-objects/LiveBlog.ts:95-113](src/durable-objects/LiveBlog.ts#L95-L113)

### Durable Object Naming

**What is it?** DOs can be identified by:
- **Random IDs**: `idFromString(crypto.randomUUID())`
- **Named IDs**: `idFromName("my-blog")` - deterministic mapping

**In this project:** We use named IDs:
```typescript
const id = env.LIVEBLOG.idFromName(blogId);
```

This ensures the blog ID "breaking-news" always maps to the same Durable Object instance, regardless of which Cloudflare data center handles the request.

**Code location:** [src/worker/index.ts:76](src/worker/index.ts#L76)

### Workers + Next.js Integration

**How it works:**
1. Custom Worker is the entry point ([src/worker/index.ts](src/worker/index.ts))
2. `/api/liveblog/*` requests → routed to Durable Objects
3. All other requests → passed to OpenNext (Next.js on Cloudflare)

This hybrid approach gives you:
- Full Next.js App Router features (SSR, Server Components)
- Direct access to Cloudflare primitives (Durable Objects, WebSockets)
- Optimal performance (no extra HTTP hop to reach DOs)

**Code location:** [src/worker/index.ts:24-43](src/worker/index.ts#L24-L43)

## Architecture

### Data Flow

```
┌─────────────┐
│   Author    │ Writes post
│  Interface  │────────────┐
└─────────────┘            │
                           ▼
                    POST /api/liveblog/{blogId}/atoms
                           │
                           ▼
┌──────────────────────────────────────────┐
│     Custom Worker (src/worker/index.ts)   │
│  - Intercepts /api/liveblog/* requests   │
│  - Routes to correct Durable Object      │
└──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────┐
│   LiveBlog Durable Object (Instance)     │
│  - Stores atom in durable storage        │
│  - Broadcasts to all WebSocket clients   │
└──────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   [Reader 1]         [Reader 2]         [Reader 3]
   WebSocket          WebSocket          WebSocket
   (hibernated)       (hibernated)       (hibernated)
        │                  │                  │
        ▼                  ▼                  ▼
   UI Updates        UI Updates         UI Updates
   Instantly         Instantly          Instantly
```

### Key Components

1. **LiveBlog Durable Object** ([src/durable-objects/LiveBlog.ts](src/durable-objects/LiveBlog.ts))
   - **Purpose**: Manages state for a single blog
   - **Responsibilities**:
     - Stores blog posts (atoms) in durable storage
     - Manages WebSocket connections with hibernation
     - Broadcasts new posts to all connected readers
   - **Cloudflare Features**: Durable Objects, WebSocket Hibernation, Durable Storage

2. **Custom Worker Handler** ([src/worker/index.ts](src/worker/index.ts))
   - **Purpose**: Entry point for all requests
   - **Responsibilities**:
     - Routes `/api/liveblog/*` to Durable Objects
     - Passes other requests to OpenNext (Next.js)
     - Exports the LiveBlog class for binding
   - **Cloudflare Features**: Workers, Durable Object Bindings

3. **Reader UI** ([app/blog/[blogId]/page.tsx](app/blog/[blogId]/page.tsx))
   - **Purpose**: Display live blog posts to readers
   - **Responsibilities**:
     - Connects to WebSocket for live updates
     - Displays all blog posts in real-time
     - Auto-reconnects on disconnection
     - Handles development vs. production mode
   - **Technologies**: Next.js 15, React 19, WebSocket API

4. **Author UI** ([app/blog/[blogId]/author/page.tsx](app/blog/[blogId]/author/page.tsx))
   - **Purpose**: Interface for creating posts
   - **Responsibilities**:
     - Form for writing and publishing posts
     - Shows recent posts
     - Provides instant feedback on publish
   - **Technologies**: Next.js 15, React 19, Fetch API

## Project Structure

```
live-blog/
├── app/                              # Next.js App Router
│   ├── page.tsx                     # Landing page
│   ├── layout.tsx                   # Root layout
│   └── blog/[blogId]/
│       ├── page.tsx                 # Reader view
│       └── author/
│           └── page.tsx             # Author view
├── src/
│   ├── durable-objects/
│   │   └── LiveBlog.ts              # LiveBlog Durable Object
│   └── worker/
│       └── index.ts                 # Custom worker handler
├── wrangler.jsonc                    # Cloudflare Workers config
├── next.config.ts                    # Next.js config
└── open-next.config.ts              # OpenNext config
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Cloudflare account (for deployment)

### Installation

```bash
npm install
```

### Development

There are two ways to run the application locally:

#### Option 1: Next.js Development Mode (Recommended for UI Development)

```bash
npm run dev
```

This starts the Next.js development server at `http://localhost:3000`

**What works:**
- ✅ UI development with hot reload
- ✅ Basic page navigation
- ✅ Mock API responses (no real-time updates)

**What doesn't work:**
- ❌ WebSocket real-time updates
- ❌ Durable Objects persistence
- ❌ Broadcasting to multiple readers

A yellow banner will appear on pages to indicate development mode limitations.

#### Option 2: Cloudflare Workers Preview (Recommended for Testing Full Functionality)

First, build the Next.js app:

```bash
npm run build
```

Then preview with Wrangler:

```bash
npm run preview
```

This starts a local Cloudflare Workers environment at `http://localhost:8788`

**What works:**
- ✅ Full WebSocket support
- ✅ Durable Objects with hibernation
- ✅ Real-time broadcasting
- ✅ Complete production-like behavior

**Note**: Changes require a rebuild (`npm run build`) - no hot reload.

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

This will:
1. Build the Next.js application
2. Generate OpenNext build for Cloudflare Workers
3. Deploy to your Cloudflare account

## Usage

### Creating a Blog

1. Visit the homepage
2. Click "Create Random Blog" to generate a new blog with a random ID
3. Or enter a specific blog ID and click "Go"

### Reader Experience

Visit `/blog/{blogId}` to:
- View all posts in the blog
- See real-time updates as authors publish new posts
- See connection status (connected/disconnected)
- Switch to Author Mode via the button

### Author Experience

Visit `/blog/{blogId}/author` to:
- Write and publish new posts
- See recent posts
- View live statistics of published content
- Switch to Reader view to see how it looks

## API Endpoints

### Endpoint Behavior

The API endpoints work differently depending on the runtime environment:

**In Workers Runtime** (`npm run preview` or production):
- Requests are intercepted by the custom worker at [src/worker/index.ts](src/worker/index.ts)
- Routes directly to the LiveBlog Durable Object
- Full WebSocket and real-time functionality

**In Next.js Dev Mode** (`npm run dev`):
- Handled by Next.js API Route Handlers at [app/api/liveblog/](app/api/liveblog/)
- Returns mock data or simulated responses
- WebSocket connections return 426 (Upgrade Required)

### Available Endpoints

- `GET /api/liveblog/{blogId}/atoms` - Get all posts
  - Workers: Fetches from Durable Object storage
  - Dev Mode: Returns empty array with `_devMode` flag

- `POST /api/liveblog/{blogId}/atoms` - Create new post
  - Workers: Stores in DO and broadcasts to WebSockets
  - Dev Mode: Returns mock atom without broadcasting

- `GET /api/liveblog/{blogId}/websocket` - WebSocket upgrade
  - Workers: Upgrades to WebSocket connection
  - Dev Mode: Returns 426 error with helpful message

- `GET /api/liveblog/{blogId}/metadata` - Get blog metadata
  - Workers: Fetches from Durable Object
  - Dev Mode: Not implemented (returns 404)

## WebSocket Protocol

### Client → Server

Currently, readers don't send messages (future: reactions, comments)

### Server → Client

```json
{
  "type": "new_atom",
  "atom": {
    "id": "uuid",
    "content": "The post content",
    "timestamp": 1234567890,
    "author": "Author Name"
  }
}
```

## Configuration

### Durable Objects Binding

In [wrangler.jsonc](wrangler.jsonc):

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "LIVEBLOG",           // The binding name (accessible as env.LIVEBLOG)
        "class_name": "LiveBlog"      // The exported class name
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",                    // Migration version tag
      "new_classes": ["LiveBlog"]     // New Durable Object classes being added
    }
  ]
}
```

**Important Notes:**
- We don't specify `script_name` because the Durable Object is defined in the same worker
- **Migrations are required** when first creating a Durable Object. The `migrations` section tells Cloudflare you're adding a new DO class
- The `tag` can be any string (commonly "v1", "v2", etc.) and is used to track schema changes
- See [Durable Objects Migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) for more details

### Worker Entry Point

The custom worker at [src/worker/index.ts](src/worker/index.ts) is configured as the main entry point.

## Technical Details

### WebSocket Hibernation

The LiveBlog Durable Object uses WebSocket hibernation for memory efficiency:

```typescript
this.ctx.acceptWebSocket(server);
server.serializeAttachment({ id: sessionId });
```

When the Durable Object hibernates, WebSocket connections remain open but don't consume memory. When a message arrives, the DO is automatically reconstructed.

### Durable Storage

Posts are stored in Durable Object storage:

```typescript
await this.ctx.storage.put('atoms', atoms);
```

This provides strong consistency and automatic replication.

### Routing Strategy

The custom worker intercepts `/api/liveblog/*` requests before they reach Next.js, routing them directly to the Durable Object for optimal performance.

## Scripts

- `npm run dev` - Next.js development server (without Workers)
- `npm run build` - Build Next.js application
- `npm run preview` - Preview with Wrangler locally
- `npm run deploy` - Deploy to Cloudflare
- `npm run cf-typegen` - Generate Cloudflare environment types

## Development Modes & Limitations

### Development Modes

The application supports two development modes:

1. **Next.js Dev Mode** (`npm run dev`)
   - Fast hot reload for UI development
   - Mock API responses without real-time functionality
   - Yellow banners indicate limited functionality
   - Ideal for: UI/UX development, styling, layout work

2. **Workers Preview Mode** (`npm run preview`)
   - Full Durable Objects and WebSocket support
   - Production-like behavior locally
   - Requires rebuild for changes
   - Ideal for: Testing real-time features, integration testing

### Limitations

- **Development Mode**: WebSocket real-time updates don't work with `npm run dev`. Use `npm run preview` for full testing.
- **Persistence**: Data is stored in Durable Objects, which is persistent but not a traditional database. Data lives in memory and storage of the DO.
- **Scaling**: Each blog ID maps to a single Durable Object instance. This provides strong consistency but means all traffic for one blog goes to one instance.
- **Hot Reload**: Changes in Workers Preview mode require a full rebuild (`npm run build`).

## Future Enhancements

- [ ] Reader reactions (likes, emojis)
- [ ] Comment threads
- [ ] Markdown support for posts
- [ ] Image uploads
- [ ] Blog settings and customization
- [ ] Analytics and metrics
- [ ] Multiple authors per blog
- [ ] Post editing and deletion

## Learning Resources

### In This Repository

- **[CLOUDFLARE_CONCEPTS.md](CLOUDFLARE_CONCEPTS.md)** - In-depth guide to Cloudflare concepts
  - Durable Objects explained
  - WebSocket hibernation deep dive
  - Durable storage patterns
  - Bindings and integration
  - Best practices and common patterns

### Code with Educational Comments

All source files include detailed educational comments explaining Cloudflare concepts:

- [src/durable-objects/LiveBlog.ts](src/durable-objects/LiveBlog.ts) - Durable Object implementation with WebSocket hibernation
- [src/worker/index.ts](src/worker/index.ts) - Custom worker routing and DO bindings

### Quick Learning Path

1. **Start here**: Read the [Cloudflare Concepts Explained](#cloudflare-concepts-explained) section above
2. **Deep dive**: Read [CLOUDFLARE_CONCEPTS.md](CLOUDFLARE_CONCEPTS.md) for comprehensive explanations
3. **Code along**: Explore [src/durable-objects/LiveBlog.ts](src/durable-objects/LiveBlog.ts) with inline comments
4. **Build**: Try modifying the code to add new features (see [Future Enhancements](#future-enhancements))

## Technologies Used

- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **Cloudflare Workers** - Edge computing platform
- **Cloudflare Durable Objects** - Stateful serverless objects
- **WebSockets** - Real-time bidirectional communication
- **OpenNext** - Cloudflare adapter for Next.js
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework

## References

### Cloudflare Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/api/websockets/)
- [Durable Objects Examples](https://developers.cloudflare.com/durable-objects/examples/)

### Next.js and OpenNext

- [Next.js Documentation](https://nextjs.org/docs)
- [OpenNext for Cloudflare](https://opennext.js.org/cloudflare)
- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/)

## License

MIT

---

**Built with passion and the hope that lives literally depend on this.** 🚀
