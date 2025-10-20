/**
 * Admin Panel Component
 * View Claude Code sessions, Docker containers, and system stats
 */

import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

interface ClaudeSession {
  projectId: string;
  userId: string;
  projectPath: string;
  isActive: boolean;
  messageCount: number;
  tokensUsed: number;
  startTime: number;
  lastActivity: number;
  uptime: number;
  uptimeFormatted: string;
  lastActivityRelative: string;
}

interface SessionsData {
  totalSessions: number;
  activeSessions: number;
  sessions: ClaudeSession[];
}

function AdminPanel() {
  const [sessionsData, setSessionsData] = useState<SessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL.replace('/api', '')}/api/admin/claude-sessions`);
      setSessionsData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load session data');
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchSessions();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-gray-400">Loading admin data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 mb-2">{error}</p>
          <button
            onClick={fetchSessions}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-100">Admin Panel</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchSessions}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Session Stats */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-200 mb-3">Claude Code Sessions</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-sm text-gray-400 mb-1">Total Sessions</div>
              <div className="text-2xl font-bold text-blue-400">{sessionsData?.totalSessions || 0}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-sm text-gray-400 mb-1">Active Sessions</div>
              <div className="text-2xl font-bold text-green-400">{sessionsData?.activeSessions || 0}</div>
            </div>
          </div>
        </div>

        {/* Session Details */}
        {sessionsData && sessionsData.sessions.length > 0 ? (
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-300">Active Sessions</h4>
            {sessionsData.sessions.map((session, index) => (
              <div
                key={session.projectId}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-200">
                        Session #{index + 1}
                      </span>
                      {session.isActive && (
                        <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded text-xs">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {session.projectId}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Uptime</div>
                    <div className="text-sm font-semibold text-gray-200">
                      {session.uptimeFormatted}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Messages</div>
                    <div className="text-gray-200">{session.messageCount}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Tokens Used</div>
                    <div className="text-gray-200">{session.tokensUsed.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Last Activity</div>
                    <div className="text-gray-200">{session.lastActivityRelative}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">User ID</div>
                    <div className="text-gray-200 text-xs font-mono truncate">
                      {session.userId.substring(0, 8)}...
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="text-gray-400 text-xs mb-1">Project Path</div>
                  <div className="text-gray-300 text-xs font-mono truncate">
                    {session.projectPath}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">No active Claude Code sessions</p>
            <p className="text-sm">Sessions will appear here when users start chatting</p>
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-6 p-3 bg-gray-800 rounded border border-gray-700">
          <div className="text-xs text-gray-400">
            <p className="mb-1">💡 <strong>Tip:</strong> Sessions are created when users send chat messages</p>
            <p>📊 Token usage is tracked per session for cost monitoring</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
