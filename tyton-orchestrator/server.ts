import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { getWebSocketIntegration } from './server/realtime/wsIntegration';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Start WebSocket integration when server is ready
  server.on('listening', async () => {
    try {
      const wsIntegration = getWebSocketIntegration();
      wsIntegration.startWebSocketServer(server);
      
      console.log('🚀 WebSocket integration started successfully');
    } catch (error) {
      console.error('❌ Failed to start WebSocket integration:', error);
    }
  });

  const port = process.env.PORT || 3000;
  
  server.listen(port, (err?: Error) => {
    if (err) throw err;
    console.log(`🌟 Server ready on http://localhost:${port}`);
  });
});