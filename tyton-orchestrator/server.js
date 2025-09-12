const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Start WebSocket integration when server is ready
  server.on('listening', async () => {
    try {
      const { getWebSocketIntegration } = await import('./server/realtime/wsIntegration.js');
      const wsIntegration = getWebSocketIntegration();
      wsIntegration.startWebSocketServer(server);
      
      console.log('🚀 WebSocket integration started successfully');
    } catch (error) {
      console.error('❌ Failed to start WebSocket integration:', error);
    }
  });

  const port = process.env.PORT || 3000;
  
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`🌟 Server ready on http://localhost:${port}`);
  });
});