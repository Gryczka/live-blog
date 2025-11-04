import { create } from 'zustand';

export interface Atom {
  id: string;
  content: string;
  timestamp: number;
  author?: string;
}

interface LiveBlogState {
  // State
  atoms: Atom[];
  isConnected: boolean;
  connectionStatus: string;
  wsRef: WebSocket | null;

  // Actions
  setAtoms: (atoms: Atom[]) => void;
  addAtom: (atom: Atom) => void;
  setConnectionStatus: (status: string) => void;
  setIsConnected: (connected: boolean) => void;
  setWsRef: (ws: WebSocket | null) => void;

  // Methods
  fetchInitialAtoms: (blogId: string) => Promise<void>;
  connectWebSocket: (blogId: string) => void;
  disconnectWebSocket: () => void;
}

export const useLiveBlogStore = create<LiveBlogState>((set, get) => ({
  // Initial state
  atoms: [],
  isConnected: false,
  connectionStatus: 'Connecting...',
  wsRef: null,

  // Actions
  setAtoms: (atoms) => set({ atoms }),

  addAtom: (atom) => set((state) => ({
    atoms: [atom, ...state.atoms]
  })),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setIsConnected: (connected) => set({ isConnected: connected }),

  setWsRef: (ws) => set({ wsRef: ws }),

  // Methods
  fetchInitialAtoms: async (blogId: string) => {
    try {
      const response = await fetch(`/api/liveblog/${blogId}/atoms`);
      if (response.ok) {
        const data = await response.json() as { atoms: Atom[] };
        // Reverse to show newest first
        set({ atoms: (data.atoms || []).reverse() });
      }
    } catch (error) {
      console.error('Failed to fetch initial atoms:', error);
    }
  },

  connectWebSocket: (blogId: string) => {
    const state = get();

    // Close existing connection if any
    if (state.wsRef) {
      state.wsRef.close();
    }

    // Determine WebSocket protocol
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'wss:'
      : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/liveblog/${blogId}/websocket`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        set({
          isConnected: true,
          connectionStatus: 'Connected - Live updates enabled'
        });
        // Fetch full atom list to ensure we have all atoms
        get().fetchInitialAtoms(blogId);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'new_atom') {
            get().addAtom(message.atom);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (typeof window !== 'undefined' && window.location.port === '3000') {
          set({
            connectionStatus: 'Development mode - WebSockets require Workers runtime',
            isConnected: false
          });
        } else {
          set({ connectionStatus: 'Connection error' });
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        set({ isConnected: false });

        // Don't attempt to reconnect if we're in dev mode
        if (typeof window !== 'undefined' && (window.location.port === '3000' || event.code === 1002)) {
          set({ connectionStatus: 'Development mode - Use `npm run preview` for WebSockets' });
        } else {
          set({ connectionStatus: 'Disconnected - Attempting to reconnect...' });
          // Attempt to reconnect after 3 seconds
          setTimeout(() => {
            get().connectWebSocket(blogId);
          }, 3000);
        }
      };

      set({ wsRef: ws });
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      set({
        connectionStatus: 'WebSocket not available in development mode',
        isConnected: false
      });
    }
  },

  disconnectWebSocket: () => {
    const state = get();
    if (state.wsRef) {
      state.wsRef.close();
      set({ wsRef: null, isConnected: false });
    }
  },
}));
