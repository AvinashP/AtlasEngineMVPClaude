/**
 * Build Panel Component
 * Handles build/deploy operations and displays build logs
 */

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { projectApi, buildApi, previewApi } from '@/services/api';
import type { Build, Preview } from '@/types';

interface BuildPanelProps {
  projectId: string;
}

function BuildPanel({ projectId }: BuildPanelProps) {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    loadBuilds();
    loadPreview();
  }, [projectId]);

  const loadBuilds = async () => {
    try {
      const response = await buildApi.list(projectId, 10);
      setBuilds(response.builds);
    } catch (error) {
      console.error('Failed to load builds:', error);
    }
  };

  const loadPreview = async () => {
    try {
      const response = await previewApi.getActive(projectId);
      setPreview(response.preview);
    } catch (error) {
      console.error('Failed to load preview:', error);
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
      toast.success('Build completed successfully!');
    } catch (error: any) {
      setBuildLogs(`Build failed: ${error.message}`);
      console.error('Build failed:', error);
      toast.error(`Build failed: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (builds.length === 0) {
      toast.error('No builds available. Please build the project first.');
      return;
    }

    const latestBuild = builds.find((b) => b.status === 'success');
    if (!latestBuild) {
      toast.error('No successful builds available');
      return;
    }

    setLoading(true);
    try {
      const response = await projectApi.deploy(projectId, latestBuild.id);
      setPreview(response.preview);
      toast.success('Deployment started successfully!');
      await loadPreview();
    } catch (error: any) {
      console.error('Deploy failed:', error);
      toast.error(`Deploy failed: ${error.message || 'Unknown error'}`);
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
      toast.success('Preview stopped successfully');
    } catch (error) {
      console.error('Failed to stop preview:', error);
      toast.error('Failed to stop preview. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'building':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getPreviewStatusColor = (status: string) => {
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
      {/* Header with Build/Deploy Buttons */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold mb-3">Build & Deploy</h2>
        <div className="flex gap-2">
          <button
            onClick={handleBuild}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-medium"
          >
            {loading && showLogs ? 'Building...' : 'Build'}
          </button>
          <button
            onClick={handleDeploy}
            disabled={loading || builds.length === 0}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm font-medium"
          >
            Deploy
          </button>
          {preview && (
            <button
              onClick={handleStopPreview}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm font-medium"
            >
              Stop Preview
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
          <div className="p-3 bg-black text-xs font-mono text-green-400 max-h-64 overflow-auto">
            <pre>{buildLogs}</pre>
          </div>
        </div>
      )}

      {/* Docker Preview Status */}
      {preview && (
        <div className="p-3 bg-gray-900 border-b border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Docker Preview Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Status:</span>
              <span className={`text-xs font-semibold ${getPreviewStatusColor(preview.status)}`}>
                {preview.status.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Port:</span>
              <span className="text-xs text-gray-300">{preview.port}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">URL:</span>
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 truncate"
              >
                {preview.url}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Build History */}
      <div className="flex-1 overflow-auto p-3">
        <h3 className="text-xs font-semibold text-gray-400 mb-2">Build History</h3>
        {builds.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No builds yet. Click "Build" to create your first build.
          </div>
        ) : (
          <div className="space-y-2">
            {builds.map((build) => (
              <div
                key={build.id}
                className="flex items-center justify-between p-3 bg-gray-900 rounded"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400 mb-1">
                    {new Date(build.createdAt).toLocaleString()}
                  </div>
                  {build.logs && (
                    <div className="text-xs text-gray-500 truncate">
                      {build.logs.substring(0, 50)}...
                    </div>
                  )}
                </div>
                <div className="ml-3">
                  <span className={`text-xs font-semibold ${getStatusColor(build.status)}`}>
                    {build.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-10">
          <div className="text-center">
            <div className="mb-4">
              <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div className="text-white text-lg font-semibold">
              {showLogs ? 'Building project...' : 'Processing...'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BuildPanel;
