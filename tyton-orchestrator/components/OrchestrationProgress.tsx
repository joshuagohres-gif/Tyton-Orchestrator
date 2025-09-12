'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Play, 
  Pause, 
  Square, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff
} from 'lucide-react';

interface StageProgress {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  attempts: number;
  message?: string;
  duration?: number;
  timestamp: number;
}

interface OrchestrationStatus {
  runId: string;
  projectId: string;
  status: 'starting' | 'running' | 'paused' | 'cancelling' | 'done' | 'error';
  progress: {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
  };
  currentStage?: string;
  message?: string;
  startedAt: number;
  updatedAt: number;
  estimatedCompletion?: number;
}

interface OrchestrationProgressProps {
  projectId: string;
  authToken: string;
  onStatusChange?: (status: OrchestrationStatus) => void;
}

const STAGE_NAMES: Record<string, string> = {
  'review:project': 'Project Review',
  'analysis:viability_safety': 'Safety Analysis',
  'selection:components': 'Component Selection',
  'wiring:pins': 'Pin Wiring',
  'schematic:generate': 'Schematic Generation',
  'eda:enrich': 'EDA Enrichment',
  'placement:seed': 'Component Placement',
  'export:bom': 'BOM Export',
  'export:kicad': 'KiCad Export',
  'export:dsn': 'DSN Export'
};

export default function OrchestrationProgress({ 
  projectId, 
  authToken,
  onStatusChange 
}: OrchestrationProgressProps) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<OrchestrationStatus | null>(null);
  const [stages, setStages] = useState<Map<string, StageProgress>>(new Map());
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectWebSocket = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/orchestrator?token=${encodeURIComponent(authToken)}`;
      
      const websocket = new WebSocket(wsUrl);
      
      websocket.onopen = () => {
        console.log('🔌 WebSocket connected');
        setConnected(true);
        setConnectionError(null);
        
        // Subscribe to project updates
        websocket.send(JSON.stringify({
          type: 'subscribe',
          runId: projectId
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log('✅ WebSocket connection confirmed:', message.clientId);
              break;
              
            case 'subscribed':
              console.log('📡 Subscribed to run:', message.runId);
              break;
              
            case 'progress':
              handleProgressUpdate(message);
              break;
              
            case 'status':
              handleStatusUpdate(message);
              break;
              
            case 'control_ack':
              console.log('🎮 Control command acknowledged:', message.action);
              break;
              
            case 'error':
              console.error('WebSocket error:', message.error);
              setConnectionError(message.error);
              break;
              
            case 'pong':
              // Handle heartbeat response
              break;
              
            default:
              console.log('Unknown WebSocket message:', message);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      websocket.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        setWs(null);
        
        // Attempt to reconnect after a delay
        if (event.code !== 1000) { // Not a normal closure
          setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connectWebSocket();
          }, 3000);
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('WebSocket connection failed');
      };

      setWs(websocket);
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError('Failed to create WebSocket connection');
    }
  }, [projectId, authToken]);

  const handleProgressUpdate = (update: any) => {
    setStages(prev => {
      const newStages = new Map(prev);
      newStages.set(update.stageId, {
        id: update.stageId,
        name: STAGE_NAMES[update.stageId] || update.stageId,
        status: update.status,
        attempts: update.attempts || 1,
        message: update.message,
        duration: update.duration,
        timestamp: update.timestamp
      });
      return newStages;
    });
  };

  const handleStatusUpdate = (statusUpdate: any) => {
    const newStatus: OrchestrationStatus = {
      runId: statusUpdate.runId,
      projectId: statusUpdate.projectId,
      status: statusUpdate.status,
      progress: statusUpdate.progress,
      currentStage: statusUpdate.currentStage,
      message: statusUpdate.message,
      startedAt: statusUpdate.startedAt,
      updatedAt: statusUpdate.updatedAt,
      estimatedCompletion: statusUpdate.estimatedCompletion
    };
    
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const sendControlCommand = async (action: 'pause' | 'resume' | 'cancel', reason?: string) => {
    try {
      const response = await fetch(`/api/orchestrator/${projectId}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ action, reason })
      });

      if (!response.ok) {
        throw new Error(`Control command failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('🎮 Control command sent:', result);
    } catch (error) {
      console.error('Failed to send control command:', error);
    }
  };

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (ws) {
        ws.close(1000, 'Component unmounting');
      }
    };
  }, [connectWebSocket]);

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
      case 'done':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-500';
      case 'completed':
      case 'done':
        return 'bg-green-500';
      case 'failed':
      case 'error':
        return 'bg-red-500';
      case 'paused':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatETA = (timestamp?: number) => {
    if (!timestamp) return null;
    const remaining = timestamp - Date.now();
    if (remaining <= 0) return 'Soon';
    return formatDuration(remaining);
  };

  const stageArray = Array.from(stages.values()).sort((a, b) => 
    Object.keys(STAGE_NAMES).indexOf(a.id) - Object.keys(STAGE_NAMES).indexOf(b.id)
  );

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          {getStatusIcon(status?.status)}
          Orchestration Progress
        </CardTitle>
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <Badge variant={connected ? 'default' : 'destructive'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        {connectionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{connectionError}</span>
            </div>
          </div>
        )}

        {status && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium">{status.message || 'Running orchestration...'}</h3>
              <div className="flex gap-2">
                {status.status === 'running' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => sendControlCommand('pause')}
                  >
                    <Pause className="h-3 w-3 mr-1" />
                    Pause
                  </Button>
                )}
                {status.status === 'paused' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => sendControlCommand('resume')}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Resume
                  </Button>
                )}
                {(status.status === 'running' || status.status === 'paused') && (
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={() => sendControlCommand('cancel', 'User requested cancellation')}
                  >
                    <Square className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            
            <Progress 
              value={status.progress.percentage} 
              className="mb-2" 
            />
            
            <div className="flex justify-between text-sm text-gray-600">
              <span>
                {status.progress.completed} of {status.progress.total} stages completed
                {status.progress.failed > 0 && ` (${status.progress.failed} failed)`}
              </span>
              {status.estimatedCompletion && (
                <span>ETA: {formatETA(status.estimatedCompletion)}</span>
              )}
            </div>
          </div>
        )}

        {stageArray.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900">Stage Details</h4>
            {stageArray.map(stage => (
              <div 
                key={stage.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(stage.status)}
                  <div>
                    <div className="font-medium">{stage.name}</div>
                    {stage.message && (
                      <div className="text-sm text-gray-600">{stage.message}</div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {stage.attempts > 1 && (
                    <Badge variant="outline" className="text-xs">
                      Attempt {stage.attempts}
                    </Badge>
                  )}
                  {stage.duration && (
                    <span>{formatDuration(stage.duration)}</span>
                  )}
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(stage.status)}`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!connected && !connectionError && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-400" />
            <p className="text-gray-500">Connecting to orchestration service...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}