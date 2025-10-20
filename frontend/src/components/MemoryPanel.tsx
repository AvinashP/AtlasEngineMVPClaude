/**
 * Memory Panel Component
 * View/edit CLAUDE.md with checkpoint creation
 */

import { useState, useEffect } from 'react';
import { memoryApi } from '@/services/api';
import type { MemoryStats } from '@/types';

interface MemoryPanelProps {
  projectId: string;
}

function MemoryPanel({ projectId }: MemoryPanelProps) {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadMemory();
  }, [projectId]);

  const loadMemory = async () => {
    setLoading(true);
    try {
      const response = await memoryApi.get(projectId);
      setContent(response.content);
      setOriginalContent(response.content);
      setStats(response.stats);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load memory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setHasChanges(e.target.value !== originalContent);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Parse the content to extract structured updates
      // For now, we'll just save the entire content as one update
      await memoryApi.update(projectId, { content });
      setOriginalContent(content);
      setHasChanges(false);
      await loadMemory();
    } catch (error) {
      console.error('Failed to save memory:', error);
      alert('Failed to save memory');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCheckpoint = async () => {
    const name = prompt('Checkpoint name:');
    if (!name) return;

    const notes = prompt('Notes (optional):');

    setLoading(true);
    try {
      await memoryApi.createCheckpoint(projectId, name, notes || undefined);
      alert('Checkpoint created successfully');
      await loadMemory();
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      alert('Failed to create checkpoint');
    } finally {
      setLoading(false);
    }
  };

  const handleCompact = async () => {
    if (!confirm('Compact memory? This will keep the last 5 snapshots and remove older ones.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await memoryApi.compact(projectId, 5);
      alert(`Compacted successfully. Removed ${response.removedCount} snapshots.`);
      await loadMemory();
    } catch (error) {
      console.error('Failed to compact memory:', error);
      alert('Failed to compact memory');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading && !content) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-800">
        <div className="text-gray-500">Loading memory...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold mb-3">Memory (CLAUDE.md)</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            {isEditing ? 'View Mode' : 'Edit Mode'}
          </button>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm"
            >
              Save Changes
            </button>
          )}
          <button
            onClick={handleCreateCheckpoint}
            disabled={loading}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-sm"
          >
            Checkpoint
          </button>
          <button
            onClick={handleCompact}
            disabled={loading}
            className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded text-sm"
          >
            Compact
          </button>
          <button
            onClick={loadMemory}
            disabled={loading}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 rounded text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="p-3 bg-gray-900 border-b border-gray-700 grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-gray-400">Size</div>
            <div className="text-sm font-semibold text-gray-200">
              {formatBytes(stats.sizeBytes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Snapshots</div>
            <div className="text-sm font-semibold text-gray-200">{stats.snapshotCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Last Updated</div>
            <div className="text-sm font-semibold text-gray-200">
              {new Date(stats.lastUpdated).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Health</div>
            <div
              className={`text-sm font-semibold ${
                stats.sizeBytes > 100000 ? 'text-orange-400' : 'text-green-400'
              }`}
            >
              {stats.sizeBytes > 100000 ? 'Consider compacting' : 'Good'}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isEditing ? (
          <textarea
            value={content}
            onChange={handleContentChange}
            className="w-full h-full bg-gray-900 text-gray-200 font-mono text-sm p-3 rounded border border-gray-700 focus:outline-none focus:border-blue-500 resize-none"
            placeholder="Edit CLAUDE.md content..."
            spellCheck={false}
          />
        ) : (
          <div className="bg-gray-900 p-4 rounded border border-gray-700 h-full overflow-auto">
            <pre className="text-gray-200 text-sm font-mono whitespace-pre-wrap">{content}</pre>
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="p-3 bg-gray-900 border-t border-gray-700 text-xs text-gray-500">
        {isEditing ? (
          <p>
            Edit the CLAUDE.md content. Changes are saved to the memory system and create new
            snapshots.
          </p>
        ) : (
          <p>
            This is your project's persistent memory. Claude reads this to understand your project
            context across sessions.
          </p>
        )}
      </div>
    </div>
  );
}

export default MemoryPanel;
