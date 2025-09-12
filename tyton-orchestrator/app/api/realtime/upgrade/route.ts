import { NextRequest } from 'next/server';
import { getWebSocketServer } from '@/server/realtime/wsServer';

export const runtime = 'nodejs';

/**
 * WebSocket upgrade route for Next.js API
 * Handles WebSocket connection upgrades
 */
export async function GET(request: NextRequest) {
  // Check if this is a WebSocket upgrade request
  const upgrade = request.headers.get('upgrade');
  const connection = request.headers.get('connection');

  if (upgrade !== 'websocket' || !connection?.toLowerCase().includes('upgrade')) {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  try {
    // Get the WebSocket server instance
    const wsServer = getWebSocketServer();
    
    // In production, the WebSocket server is started by server.ts
    // This route mainly serves as documentation and health check
    
    return new Response(
      JSON.stringify({
        status: 'WebSocket server running',
        endpoint: '/ws/orchestrator',
        protocols: ['v1'],
        stats: wsServer.getStats()
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Upgrade': 'websocket',
          'Connection': 'Upgrade'
        }
      }
    );
  } catch (error) {
    console.error('WebSocket upgrade error:', error);
    return new Response(
      JSON.stringify({
        error: 'WebSocket server not available',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}