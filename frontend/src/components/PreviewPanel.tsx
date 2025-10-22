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
  const [hasDevServerProject, setHasDevServerProject] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [iframeReloadKey, setIframeReloadKey] = useState(0);

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
    } else if (!hasDevServerProject) {
      // Only use static preview if this is NOT a dev server project
      newUrl = `http://localhost:3000/preview/${projectId}/`;
    } else {
      // For dev server projects, show blank when server is stopped
      newUrl = '';
    }

    console.log('Preview type changed, new URL:', newUrl);
    setCurrentUrl(newUrl);
  }, [devServer, preview, projectId, hasDevServerProject]);

  // Reload iframe when currentUrl changes
  useEffect(() => {
    if (iframeRef.current && currentUrl) {
      console.log('Updating iframe to:', currentUrl);
      const iframe = iframeRef.current;
      // Force a complete reload by setting to blank first
      iframe.src = 'about:blank';
      // Then set to the actual URL after a brief delay
      setTimeout(() => {
        if (iframe && currentUrl) {
          iframe.src = currentUrl;
          console.log('✅ Preview iframe loaded:', currentUrl);
        }
      }, 50);
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
        setHasDevServerProject(true);
      } else {
        // Don't auto-start dev server on page load
        // User can manually start it with the "Start Dev Server" button
        console.log('Dev server not running. Use Start Dev Server button to start.');
        setDevServer(null);
        // Note: We can't definitively know if this is a dev server project without trying to start it
        // So we'll leave hasDevServerProject as false until dev server is started
      }
    } catch (error) {
      console.error('Failed to check dev server status:', error);
      setDevServer(null);
      setHasDevServerProject(false);
    }
  };

  const handleStartDevServer = async () => {
    setIsStartingDevServer(true);
    try {
      const startResponse = await devServerApi.start(projectId);
      console.log('🚀 Start response:', startResponse);
      console.log('🚀 Dev server object:', startResponse.devServer);
      console.log('🚀 Running status:', startResponse.devServer?.running);

      // Update state
      setDevServer(startResponse.devServer);
      setHasDevServerProject(true); // Mark this as a dev server project
      setIframeReloadKey(prev => prev + 1); // Force iframe reload

      console.log('✅ State updated, devServer:', startResponse.devServer);
      toast.success(`Dev server started on port ${startResponse.devServer.port}`);
    } catch (error: any) {
      console.error('❌ Failed to start dev server:', error);
      toast.error(`Failed to start dev server: ${error.message}`);
      // If it failed because it's not a dev server project, mark it as such
      if (error.message?.includes('Not a recognized dev server project')) {
        setHasDevServerProject(false);
      }
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const handleStopDevServer = async () => {
    if (!devServer) return;

    try {
      await devServerApi.stop(projectId);
      setDevServer(null);
      setIframeReloadKey(prev => prev + 1); // Force iframe reload
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
    console.log('🔄 Manually refreshing preview');
    setIframeReloadKey(prev => prev + 1); // Force iframe remount
    toast.success('Preview refreshed');
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
          <span className="text-gray-300 truncate">
            {currentUrl || (hasDevServerProject ? 'Dev server stopped' : 'No preview available')}
          </span>
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
        {/* Message: Dev server stopped */}
        {!currentUrl && hasDevServerProject && !isStartingDevServer && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="text-center px-6">
              <div className="mb-4">
                <svg className="h-16 w-16 text-gray-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-white text-xl font-semibold mb-3">Dev Server Stopped</div>
              <div className="text-gray-400 mb-4 max-w-md">
                This project requires a development server (Vite/Next.js/CRA) to preview.
                Click the "Start Dev Server" button above to view the preview.
              </div>
              <button
                onClick={handleStartDevServer}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Dev Server
              </button>
            </div>
          </div>
        )}

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
          key={`preview-${refreshKey}-${iframeReloadKey}`}
          src={currentUrl || 'about:blank'}
          className={`w-full h-full border-0 ${!currentUrl ? 'hidden' : ''}`}
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
