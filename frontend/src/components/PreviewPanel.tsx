/**
 * Preview Panel Component
 * Displays app preview with build/deploy controls
 */

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { projectApi, previewApi, buildApi, devServerApi, type DevServer } from '@/services/api';
import type { Preview, Build } from '@/types';

interface PreviewPanelProps {
  projectId: string;
  refreshKey?: number; // Increment this to trigger iframe reload
}

function PreviewPanel({ projectId, refreshKey }: PreviewPanelProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);
  const [devServer, setDevServer] = useState<DevServer | null>(null);
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    loadPreview();
    loadBuilds();
    checkAndStartDevServer();
  }, [projectId]);

  // Update current URL when preview/devServer changes
  useEffect(() => {
    let newUrl = '';
    if (devServer && devServer.running) {
      newUrl = devServer.url;
    } else if (preview && preview.status === 'healthy') {
      newUrl = preview.url;
    } else {
      newUrl = `http://localhost:3000/preview/${projectId}/`;
    }

    console.log('Preview type changed, new URL:', newUrl);
    setCurrentUrl(newUrl);
  }, [devServer, preview, projectId]);

  // Reload iframe when currentUrl changes
  useEffect(() => {
    if (iframeRef.current && currentUrl) {
      console.log('Updating iframe to:', currentUrl);
      iframeRef.current.src = currentUrl;
    }
  }, [currentUrl]);

  // Reload iframe when files change
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0 && iframeRef.current) {
      console.log(`🔄 Refreshing preview iframe (refreshKey: ${refreshKey})`);
      // Force iframe reload
      const iframe = iframeRef.current;
      const currentSrc = iframe.src;
      console.log(`📍 Current iframe src: ${currentSrc}`);
      iframe.src = 'about:blank';
      setTimeout(() => {
        iframe.src = currentSrc;
        console.log(`✅ Preview iframe reloaded`);
      }, 100);
    }
  }, [refreshKey]);

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

  const checkAndStartDevServer = async () => {
    try {
      // Check if dev server is already running
      const statusResponse = await devServerApi.getStatus(projectId);

      if (statusResponse.devServer.running) {
        console.log('Dev server already running:', statusResponse.devServer);
        setDevServer(statusResponse.devServer);
      } else {
        // Don't auto-start dev server on page load
        // User can manually start it with the "Start Dev Server" button
        console.log('Dev server not running. Use Start Dev Server button to start.');
        setDevServer(null);
      }
    } catch (error) {
      console.error('Failed to check dev server status:', error);
      setDevServer(null);
    }
  };

  const handleStartDevServer = async () => {
    setIsStartingDevServer(true);
    try {
      const startResponse = await devServerApi.start(projectId);
      console.log('Dev server started:', startResponse.devServer);
      setDevServer(startResponse.devServer);
      toast.success(`Dev server started on port ${startResponse.devServer.port}`);
    } catch (error: any) {
      console.error('Failed to start dev server:', error);
      toast.error(`Failed to start dev server: ${error.message}`);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const handleStopDevServer = async () => {
    if (!devServer) return;

    try {
      await devServerApi.stop(projectId);
      setDevServer(null);
      toast.success('Dev server stopped');
    } catch (error: any) {
      console.error('Failed to stop dev server:', error);
      toast.error(`Failed to stop dev server: ${error.message}`);
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

  const handleRefresh = () => {
    if (iframeRef.current) {
      console.log('🔄 Manually refreshing preview');
      const iframe = iframeRef.current;
      iframe.src = iframe.src; // Force reload
      toast.success('Preview refreshed');
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

      {/* URL Bar */}
      <div className="p-2 bg-gray-900 border-b border-gray-700 flex items-center gap-2">
        <button
          onClick={handleRefresh}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1"
          title="Refresh preview"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
        <div className="flex-1 flex items-center bg-gray-800 rounded px-3 py-1.5 text-sm">
          <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <span className="text-gray-300 truncate">{currentUrl || 'No preview available'}</span>
        </div>
        {devServer && devServer.running ? (
          <button
            onClick={handleStopDevServer}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm"
            title="Stop dev server"
          >
            Stop Dev Server
          </button>
        ) : (
          <button
            onClick={handleStartDevServer}
            disabled={isStartingDevServer}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm flex items-center gap-1"
            title="Start dev server for HMR"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {isStartingDevServer ? 'Starting...' : 'Start Dev Server'}
          </button>
        )}
      </div>

      {/* Preview iframe */}
      <div className="flex-1 bg-white relative">
        {/* Loading state: Starting dev server */}
        {isStartingDevServer && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="text-center">
              <div className="mb-4">
                <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="text-white text-lg font-semibold mb-2">Starting development server...</div>
              <div className="text-sm text-gray-400">Installing dependencies and starting Vite</div>
              <div className="mt-2 text-xs text-gray-500">This may take a minute on first run</div>
            </div>
          </div>
        )}

        {/* Loading state: Building */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-95 z-10">
            <div className="text-center">
              <div className="mb-4">
                <svg className="animate-spin h-12 w-12 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="text-white text-lg font-semibold mb-2">Building project...</div>
              <div className="text-sm text-gray-400">Compiling and bundling assets</div>
            </div>
          </div>
        )}

        {/* Single iframe that updates src based on preview type */}
        <iframe
          ref={iframeRef}
          key={`preview-${refreshKey}`}
          src={currentUrl}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title={
            devServer?.running
              ? 'Dev Server Preview'
              : preview?.status === 'healthy'
              ? 'Docker Preview'
              : 'Static Preview'
          }
        />
      </div>
    </div>
  );
}

export default PreviewPanel;
