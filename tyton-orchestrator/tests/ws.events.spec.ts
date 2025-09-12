import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { getWebSocketServer } from '../server/realtime/wsServer';
import { getWebSocketIntegration } from '../server/realtime/wsIntegration';

describe('WebSocket Events', () => {
  let wsServer: any;
  let wsIntegration: any;
  let testPort = 3001;

  beforeEach(async () => {
    // Use a different port for each test to avoid conflicts
    testPort = 3000 + Math.floor(Math.random() * 1000);
    wsServer = getWebSocketServer(testPort);
    wsIntegration = getWebSocketIntegration();
  });

  afterEach(() => {
    if (wsServer) {
      wsServer.stop();
    }
  });

  it('should handle WebSocket connections and disconnections', async () => {
    return new Promise<void>((resolve, reject) => {
      let connected = false;
      let disconnected = false;

      // Start WebSocket server
      wsServer.start();

      // Listen for connection events
      wsServer.on('connection', () => {
        connected = true;
      });

      wsServer.on('disconnect', () => {
        disconnected = true;
        
        // Verify both events happened
        expect(connected).toBe(true);
        expect(disconnected).toBe(true);
        resolve();
      });

      // Connect and then disconnect
      setTimeout(() => {
        const client = new WebSocket(`ws://localhost:${testPort}/ws/orchestrator`);
        
        client.on('open', () => {
          connected = true;
          setTimeout(() => {
            client.close();
          }, 100);
        });

        client.on('close', () => {
          disconnected = true;
          resolve();
        });

        client.on('error', (error) => {
          reject(new Error(`WebSocket client error: ${error.message}`));
        });
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Test timeout - WebSocket connection events not received'));
      }, 5000);
    });
  });

  it('should broadcast stage events to subscribed clients', async () => {
    return new Promise<void>((resolve, reject) => {
      let eventsReceived: any[] = [];
      const testRunId = 'test-run-123';
      const testStageId = 'test-stage-456';

      // Start WebSocket server
      wsServer.start();

      setTimeout(() => {
        const client = new WebSocket(`ws://localhost:${testPort}/ws/orchestrator`);
        
        client.on('open', () => {
          // Subscribe to test run
          client.send(JSON.stringify({
            type: 'subscribe',
            runId: testRunId
          }));

          // Wait a bit, then broadcast a progress event
          setTimeout(() => {
            wsServer.broadcastProgress({
              runId: testRunId,
              stageId: testStageId,
              status: 'running',
              attempts: 1,
              message: 'Test stage running',
              timestamp: Date.now()
            });
          }, 200);
        });

        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          eventsReceived.push(message);

          // Look for our progress event
          const progressEvent = eventsReceived.find(
            event => event.type === 'progress' && event.stageId === testStageId
          );

          if (progressEvent) {
            expect(progressEvent.runId).toBe(testRunId);
            expect(progressEvent.status).toBe('running');
            expect(progressEvent.message).toBe('Test stage running');
            
            client.close();
            resolve();
          }
        });

        client.on('error', (error) => {
          reject(new Error(`WebSocket client error: ${error.message}`));
        });
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        console.log('Events received:', eventsReceived);
        reject(new Error('Test timeout - Progress event not received'));
      }, 5000);
    });
  });

  it('should handle subscription and unsubscription correctly', async () => {
    return new Promise<void>((resolve, reject) => {
      let subscriptionConfirmed = false;
      let unsubscriptionConfirmed = false;
      const testRunId = 'test-run-789';

      // Start WebSocket server
      wsServer.start();

      setTimeout(() => {
        const client = new WebSocket(`ws://localhost:${testPort}/ws/orchestrator`);
        
        client.on('open', () => {
          // Subscribe to test run
          client.send(JSON.stringify({
            type: 'subscribe',
            runId: testRunId
          }));
        });

        client.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'subscribed' && message.runId === testRunId) {
            subscriptionConfirmed = true;
            
            // Now unsubscribe
            client.send(JSON.stringify({
              type: 'unsubscribe',
              runId: testRunId
            }));
          }

          if (message.type === 'unsubscribed' && message.runId === testRunId) {
            unsubscriptionConfirmed = true;
            
            expect(subscriptionConfirmed).toBe(true);
            expect(unsubscriptionConfirmed).toBe(true);
            
            client.close();
            resolve();
          }
        });

        client.on('error', (error) => {
          reject(new Error(`WebSocket client error: ${error.message}`));
        });
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Test timeout - Subscription events not received'));
      }, 5000);
    });
  });

  it('should maintain ordered event delivery', async () => {
    return new Promise<void>((resolve, reject) => {
      const testRunId = 'test-run-ordered';
      const eventsReceived: any[] = [];
      const expectedEvents = [
        { stageId: 'stage1', status: 'pending' },
        { stageId: 'stage1', status: 'running' },
        { stageId: 'stage1', status: 'completed' },
        { stageId: 'stage2', status: 'pending' },
        { stageId: 'stage2', status: 'running' }
      ];

      // Start WebSocket server
      wsServer.start();

      setTimeout(() => {
        const client = new WebSocket(`ws://localhost:${testPort}/ws/orchestrator`);
        
        client.on('open', () => {
          // Subscribe to test run
          client.send(JSON.stringify({
            type: 'subscribe',
            runId: testRunId
          }));

          // Send events in sequence
          setTimeout(() => {
            expectedEvents.forEach((event, index) => {
              setTimeout(() => {
                wsServer.broadcastProgress({
                  runId: testRunId,
                  stageId: event.stageId,
                  status: event.status,
                  attempts: 1,
                  timestamp: Date.now()
                });
              }, index * 50); // 50ms apart
            });
          }, 200);
        });

        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'progress') {
            eventsReceived.push({
              stageId: message.stageId,
              status: message.status
            });

            // Check if we received all events
            if (eventsReceived.length === expectedEvents.length) {
              // Verify order
              expect(eventsReceived).toEqual(expectedEvents);
              
              client.close();
              resolve();
            }
          }
        });

        client.on('error', (error) => {
          reject(new Error(`WebSocket client error: ${error.message}`));
        });
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        console.log('Expected:', expectedEvents);
        console.log('Received:', eventsReceived);
        reject(new Error('Test timeout - Ordered events not received'));
      }, 10000);
    });
  });
});