"use client";

import React, { useState, useEffect } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  MessageSquare,
  Activity,
  Settings
} from "lucide-react";

interface StageInfo {
  stageId: string;
  name: string;
  description: string;
  status: "pending" | "running" | "waiting_review" | "error" | "done";
  attempts: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  needsReview: boolean;
  dependencies: string[];
}

interface LayerInfo {
  index: number;
  stages: string[];
  completed: boolean;
  running: boolean;
}

interface ReviewPayload {
  summary?: string;
  details?: any;
  recommendations?: string[];
  warningFlags?: string[];
}

interface PendingReview {
  id: string;
  stageId: string;
  status: string;
  payload: ReviewPayload;
  createdAt: string;
}

interface LogEntry {
  t: string;
  level: "info" | "warn" | "error";
  msg: string;
  meta?: any;
}

interface OrchestratorStatus {
  orchestratorId?: string;
  status: "idle" | "running" | "waiting_review" | "paused" | "error" | "done";
  progress: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    percentage: number;
  };
  stages: StageInfo[];
  layers: LayerInfo[];
  pendingReview: PendingReview | null;
  logs: LogEntry[];
  message: string;
}

interface OrchestratorPanelProps {
  projectId: string;
}

export default function OrchestratorPanel({ projectId }: OrchestratorPanelProps) {
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch orchestrator status
  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/orchestrator/status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch orchestrator status:", err);
      setError(err.message);
    }
  };

  // Start orchestrator
  const startOrchestrator = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/orchestrator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start orchestrator");
      }

      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle review action
  const handleReviewAction = async (action: "approve" | "reject") => {
    if (!status?.pendingReview) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/orchestrator/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewId: status.pendingReview.id,
          stageId: status.pendingReview.stageId,
          notes: reviewNotes.trim() || undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} review`);
      }

      setReviewNotes("");
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Retry failed stages
  const retryOrchestrator = async (stageId?: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/orchestrator/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to retry");
      }

      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchStatus();

    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 2000); // Poll every 2 seconds
      return () => clearInterval(interval);
    }
  }, [projectId, autoRefresh]);

  // Status icon helper
  const getStatusIcon = (stageStatus: string) => {
    switch (stageStatus) {
      case "done":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "running":
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      case "waiting_review":
        return <MessageSquare className="w-5 h-5 text-yellow-500" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  if (!status) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Orchestrator</h2>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Pipeline Orchestrator</h2>
          <p className="text-sm text-gray-600">{status.message}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-1"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Status Overview */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              status.status === "done" ? "bg-green-100 text-green-800" :
              status.status === "running" ? "bg-blue-100 text-blue-800" :
              status.status === "waiting_review" ? "bg-yellow-100 text-yellow-800" :
              status.status === "error" ? "bg-red-100 text-red-800" :
              "bg-gray-100 text-gray-800"
            }`}>
              {status.status.replace("_", " ").toUpperCase()}
            </div>
            <span className="text-lg font-semibold">
              {status.progress.completed}/{status.progress.total} stages completed
            </span>
          </div>
          <div className="flex gap-2">
            {status.status === "idle" && (
              <button
                onClick={startOrchestrator}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                Start Pipeline
              </button>
            )}
            {status.status === "error" && (
              <button
                onClick={() => retryOrchestrator()}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Retry Failed
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${status.progress.percentage}%` }}
          />
        </div>
        <div className="text-sm text-gray-600">
          {status.progress.percentage}% complete
          {status.progress.failed > 0 && (
            <span className="text-red-600 ml-2">• {status.progress.failed} failed</span>
          )}
          {status.progress.running > 0 && (
            <span className="text-blue-600 ml-2">• {status.progress.running} running</span>
          )}
        </div>
      </div>

      {/* Pending Review */}
      {status.pendingReview && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-800 mb-2">
            Review Required: {status.pendingReview.stageId}
          </h3>
          <div className="space-y-3">
            <p className="text-sm text-yellow-700">
              {status.pendingReview.payload.summary || "Stage requires human review"}
            </p>
            
            {status.pendingReview.payload.recommendations && (
              <div>
                <h4 className="text-sm font-medium text-yellow-800">Recommendations:</h4>
                <ul className="text-sm text-yellow-700 list-disc list-inside">
                  {status.pendingReview.payload.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            {status.pendingReview.payload.warningFlags && status.pendingReview.payload.warningFlags.length > 0 && (
              <div className="p-2 bg-red-100 border border-red-300 rounded">
                <h4 className="text-sm font-medium text-red-800">Safety Warnings:</h4>
                <ul className="text-sm text-red-700 list-disc list-inside">
                  {status.pendingReview.payload.warningFlags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-yellow-800 mb-1">
                Review Notes (optional):
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes about your review decision..."
                className="w-full px-3 py-2 border border-yellow-300 rounded text-sm"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleReviewAction("approve")}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
              <button
                onClick={() => handleReviewAction("reject")}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Grid */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Pipeline Stages</h3>
        </div>
        <div className="p-4 space-y-4">
          {status.layers.map((layer) => (
            <div key={layer.index} className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600">
                Layer {layer.index + 1}
                {layer.completed && <span className="text-green-600 ml-2">✓ Complete</span>}
                {layer.running && <span className="text-blue-600 ml-2">⚡ Running</span>}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {layer.stages.map((stageId) => {
                  const stage = status.stages.find(s => s.stageId === stageId);
                  if (!stage) return null;

                  return (
                    <div key={stageId} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{stage.name}</span>
                        {getStatusIcon(stage.status)}
                      </div>
                      <p className="text-xs text-gray-600">{stage.description}</p>
                      
                      {stage.attempts > 0 && (
                        <div className="text-xs text-gray-500">
                          Attempts: {stage.attempts}
                        </div>
                      )}
                      
                      {stage.errorMessage && (
                        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                          {stage.errorMessage}
                        </div>
                      )}
                      
                      {stage.status === "error" && (
                        <button
                          onClick={() => retryOrchestrator(stage.stageId)}
                          disabled={loading}
                          className="w-full text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:opacity-50"
                        >
                          Retry Stage
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Logs */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Recent Activity</h3>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto">
          {status.logs.length === 0 ? (
            <p className="text-sm text-gray-500">No activity logs yet</p>
          ) : (
            <div className="space-y-2">
              {status.logs.slice().reverse().map((log, index) => (
                <div key={index} className="flex gap-3 text-sm">
                  <span className="text-gray-400 font-mono text-xs">
                    {new Date(log.t).toLocaleTimeString()}
                  </span>
                  <span className={`font-medium ${
                    log.level === "error" ? "text-red-600" :
                    log.level === "warn" ? "text-yellow-600" :
                    "text-gray-600"
                  }`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="text-gray-800">{log.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}