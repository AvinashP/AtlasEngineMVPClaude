/**
 * Preview Panel Component
 * Displays app preview with build/deploy controls
 */

import { useState, useEffect } from 'react';
import { projectApi, previewApi, buildApi } from '@/services/api';
import type { Preview, Build } from '@/types';

interface PreviewPanelProps {
  projectId: string;
}

function PreviewPanel({ projectId }: PreviewPanelProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    loadPreview();
    loadBuilds();
  }, [projectId]);

  const loadPreview = async () => {
    try {
      const response = await previewApi.getActive(projectId);
      setPreview(response.preview);
    } catch (error) {
      console.error('Failed to load preview:', error);
    }
  };

  const loadBuilds = async () => {
    try {
      const response = await buildApi.list(projectId, 5);
      setBuilds(response.builds);
    } catch (error) {
      console.error('Failed to load builds:', error);
    }
  };

  const handleBuild = async () => {
    setLoading(true);
    setShowLogs(true);
    setBuildLogs('Starting build...\n');

    try {
      const response = await projectApi.build(projectId);
      setBuildLogs(response.logs || 'Build completed successfully');
      await loadBuilds();
    } catch (error: any) {
      setBuildLogs(`Build failed: ${error.message}`);
      console.error('Build failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (builds.length === 0) {
      alert('No builds available. Please build the project first.');
      return;
    }

    const latestBuild = builds.find((b) => b.status === 'success');
    if (!latestBuild) {
      alert('No successful builds available');
      return;
    }

    setLoading(true);
    try {
      const response = await projectApi.deploy(projectId, latestBuild.id);
      setPreview(response.preview);
    } catch (error: any) {
      console.error('Deploy failed:', error);
      alert(`Deploy failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStopPreview = async () => {
    if (!preview) return;

    setLoading(true);
    try {
      await previewApi.stop(preview.id);
      setPreview(null);
    } catch (error) {
      console.error('Failed to stop preview:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400';
      case 'starting':
        return 'text-yellow-400';
      case 'unhealthy':
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold mb-3">Preview</h2>
        <div className="flex gap-2">
          <button
            onClick={handleBuild}
            disabled={loading}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-medium"
          >
            {loading ? 'Building...' : 'Build'}
          </button>
          <button
            onClick={handleDeploy}
            disabled={loading || builds.length === 0}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm font-medium"
          >
            Deploy
          </button>
          {preview && (
            <button
              onClick={handleStopPreview}
              disabled={loading}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm font-medium"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Build Logs */}
      {showLogs && (
        <div className="border-b border-gray-700">
          <div className="p-2 bg-gray-900 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Build Logs</span>
            <button
              onClick={() => setShowLogs(false)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              ✕
            </button>
          </div>
          <div className="p-3 bg-black text-xs font-mono text-green-400 max-h-40 overflow-auto">
            <pre>{buildLogs}</pre>
          </div>
        </div>
      )}

      {/* Preview Status */}
      {preview && (
        <div className="p-3 bg-gray-900 border-b border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400">Status:</span>
            <span className={`text-xs font-semibold ${getStatusColor(preview.status)}`}>
              {preview.status.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Port:</span>
            <span className="text-xs text-gray-300">{preview.port}</span>
          </div>
        </div>
      )}

      {/* Build History */}
      {builds.length > 0 && (
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Recent Builds</h3>
          <div className="space-y-1">
            {builds.slice(0, 3).map((build) => (
              <div
                key={build.id}
                className="flex items-center justify-between p-2 bg-gray-900 rounded text-xs"
              >
                <span className="text-gray-300 truncate">
                  {new Date(build.createdAt).toLocaleTimeString()}
                </span>
                <span
                  className={`font-semibold ${
                    build.status === 'success' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {build.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview iframe */}
      <div className="flex-1 bg-white">
        {preview && preview.status === 'healthy' ? (
          <iframe
            src={preview.url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="App Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <div className="text-center text-gray-500">
              {preview ? (
                <>
                  <div className="mb-2">Preview {preview.status}...</div>
                  <div className="text-xs">Waiting for health check to pass</div>
                </>
              ) : (
                <>
                  <div className="mb-2">No active preview</div>
                  <div className="text-xs">Build and deploy to see your app</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PreviewPanel;
