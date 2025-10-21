/**
 * AtlasEngine MVP - Main Application
 * Modern tabbed layout: File Explorer | Tabbed Editor/Preview/Memory | Chat
 */

import { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import FileTree from './components/FileTree';
import CodeEditor from './components/CodeEditor';
import PreviewPanel from './components/PreviewPanel';
import MemoryPanel from './components/MemoryPanel';
import ChatPanel from './components/ChatPanel';
import AdminPanel from './components/AdminPanel';
import { projectApi } from './services/api';
import type { Project } from './types';

interface Tab {
  id: string;
  type: 'file' | 'preview' | 'memory' | 'admin';
  title: string;
  path?: string;
  content?: string;
  isDirty?: boolean;
}

function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Panel widths (in pixels)
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [rightPanelWidth, setRightPanelWidth] = useState(384);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Use refs for smooth resizing
  const isResizingLeftRef = useRef(false);
  const isResizingRightRef = useRef(false);
  const animationFrameRef = useRef<number>();

  // File change tracking - increment this to trigger refreshes
  const [fileChangeCounter, setFileChangeCounter] = useState(0);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Handle mouse move for resizing with smooth performance
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Use requestAnimationFrame for smooth 60fps updates
      animationFrameRef.current = requestAnimationFrame(() => {
        if (isResizingLeftRef.current) {
          const newWidth = Math.max(200, Math.min(600, e.clientX));
          setLeftPanelWidth(newWidth);
        } else if (isResizingRightRef.current) {
          const newWidth = Math.max(300, Math.min(800, window.innerWidth - e.clientX));
          setRightPanelWidth(newWidth);
        }
      });
    };

    const stopResizing = () => {
      isResizingLeftRef.current = false;
      isResizingRightRef.current = false;
      setIsResizingLeft(false);
      setIsResizingRight(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Re-enable pointer events on all iframes
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        (iframe as HTMLElement).style.pointerEvents = '';
      });

      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    // Add event listeners once at mount
    // Use window instead of document to catch events even outside the page
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    // Stop resizing if window loses focus (safety fallback)
    window.addEventListener('blur', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('blur', stopResizing);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // Empty dependency array - listeners added once

  // Auto-open Preview, Memory, and Admin tabs when project loads
  useEffect(() => {
    if (currentProject && tabs.length === 0) {
      const previewTab: Tab = {
        id: 'preview',
        type: 'preview',
        title: 'Preview',
      };
      const memoryTab: Tab = {
        id: 'memory',
        type: 'memory',
        title: 'CLAUDE.md',
      };
      const adminTab: Tab = {
        id: 'admin',
        type: 'admin',
        title: 'Admin',
      };
      setTabs([previewTab, memoryTab, adminTab]);
      setActiveTabId('preview');
    }
  }, [currentProject]);

  const loadProjects = async () => {
    try {
      const response = await projectApi.list();
      setProjects(response.projects);

      // Auto-select first project if available
      if (response.projects.length > 0 && !currentProject) {
        setCurrentProject(response.projects[0]);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error('Failed to load projects. Please refresh the page.');
    }
  };

  const handleCreateProject = async () => {
    const name = prompt('Project name:');
    if (!name) return;

    const description = prompt('Project description (optional):');

    setIsCreatingProject(true);
    try {
      const response = await projectApi.create({
        name,
        description: description || undefined,
        framework: 'react',
        language: 'typescript',
      });

      setProjects([...projects, response.project]);
      setCurrentProject(response.project);
      toast.success(`Project "${name}" created successfully!`);
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project. Please try again.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleSelectFile = (path: string, content: string) => {
    // Check if file is already open
    const existingTab = tabs.find((tab) => tab.type === 'file' && tab.path === path);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // Create new tab
    const newTab: Tab = {
      id: `file-${Date.now()}`,
      type: 'file',
      title: path.split('/').pop() || path,
      path,
      content,
      isDirty: false,
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleUpdateFileContent = (tabId: string, content: string) => {
    setTabs(
      tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, content, isDirty: tab.content !== content }
          : tab
      )
    );
  };

  const handleSaveFile = async (tabId: string) => {
    if (!currentProject) return;

    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.type !== 'file' || !tab.path || !tab.content) return;

    try {
      await projectApi.updateFileContent(currentProject.id, tab.path, tab.content);
      setTabs(
        tabs.map((t) =>
          t.id === tabId ? { ...t, isDirty: false } : t
        )
      );
      toast.success(`${tab.title} saved successfully`);
    } catch (error) {
      console.error('Failed to save file:', error);
      toast.error(`Failed to save ${tab.title}. Please try again.`);
    }
  };

  const handleCloseTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);

    // Don't allow closing Preview, Memory, and Admin tabs
    if (tab?.id === 'preview' || tab?.id === 'memory' || tab?.id === 'admin') {
      return;
    }

    if (tab?.isDirty) {
      if (!confirm('File has unsaved changes. Close anyway?')) {
        return;
      }
    }

    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);

    // Switch to another tab if closing active tab
    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  const handleFileChange = () => {
    // Increment counter to trigger refreshes in FileTree and PreviewPanel
    setFileChangeCounter((prev) => {
      const newCounter = prev + 1;
      console.log(`🔔 File change detected - refreshing UI components (counter: ${prev} → ${newCounter})`);
      return newCounter;
    });
  };

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1f2937',
            color: '#f3f4f6',
            border: '1px solid #374151',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#f3f4f6',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#f3f4f6',
            },
          },
        }}
      />
      <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Left Panel - File Explorer */}
      <div
        className="bg-gray-800 border-r border-gray-700 flex flex-col"
        style={{ width: `${leftPanelWidth}px` }}
      >
        <div className="p-3 border-b border-gray-700">
          <select
            value={currentProject?.id || ''}
            onChange={(e) => {
              const project = projects.find((p) => p.id === e.target.value);
              setCurrentProject(project || null);
              // Reset tabs when switching projects
              setTabs([]);
              setActiveTabId(null);
            }}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
          >
            <option value="">Select Project...</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreateProject}
            disabled={isCreatingProject}
            className="w-full mt-2 px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
          >
            {isCreatingProject ? 'Creating...' : '+ New Project'}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {currentProject ? (
            <FileTree
              key={`filetree-${currentProject.id}-${fileChangeCounter}`}
              projectId={currentProject.id}
              onSelectFile={handleSelectFile}
            />
          ) : (
            <div className="p-4 text-gray-500 text-sm">
              No project selected
            </div>
          )}
        </div>
      </div>

      {/* Left Resize Handle */}
      <div
        className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors"
        onMouseDown={() => {
          isResizingLeftRef.current = true;
          setIsResizingLeft(true);
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          // Prevent iframes from capturing mouse events during resize
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach((iframe) => {
            (iframe as HTMLElement).style.pointerEvents = 'none';
          });
        }}
      />

      {/* Center Panel - Tabs */}
      <div className="flex-1 flex flex-col">
        {/* Tab Bar */}
        <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center px-3 h-full border-r border-gray-700 cursor-pointer group ${
                activeTabId === tab.id
                  ? 'bg-gray-900'
                  : 'bg-gray-800 hover:bg-gray-750'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="text-sm whitespace-nowrap">
                {tab.title}
                {tab.isDirty && <span className="ml-1 text-orange-400">●</span>}
              </span>
              {tab.type === 'file' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  className="ml-2 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {tabs.length === 0 && (
            <div className="px-4 text-sm text-gray-500">
              {currentProject ? 'Open a file from the explorer' : 'Select a project to get started'}
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab?.type === 'file' && (
            <div className="h-full flex flex-col">
              <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center px-4">
                <span className="text-xs text-gray-400">{activeTab.path}</span>
                {activeTab.isDirty && (
                  <button
                    onClick={() => handleSaveFile(activeTab.id)}
                    className="ml-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  >
                    Save
                  </button>
                )}
              </div>
              <div className="flex-1">
                <CodeEditor
                  value={activeTab.content || ''}
                  onChange={(value) => handleUpdateFileContent(activeTab.id, value)}
                  language={
                    activeTab.path?.endsWith('.ts') || activeTab.path?.endsWith('.tsx')
                      ? 'typescript'
                      : 'javascript'
                  }
                />
              </div>
            </div>
          )}
          {activeTab?.type === 'preview' && currentProject && (
            <PreviewPanel
              projectId={currentProject.id}
              refreshKey={fileChangeCounter}
            />
          )}
          {activeTab?.type === 'memory' && currentProject && (
            <MemoryPanel projectId={currentProject.id} />
          )}
          {activeTab?.type === 'admin' && (
            <AdminPanel />
          )}
          {!activeTab && currentProject && (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">Welcome to {currentProject.name}</p>
                <p className="text-sm">Open a file from the explorer or use the Preview/Memory tabs</p>
              </div>
            </div>
          )}
          {!currentProject && (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No Project Selected</p>
                <p className="text-sm">Select or create a project to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Resize Handle */}
      <div
        className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors"
        onMouseDown={() => {
          isResizingRightRef.current = true;
          setIsResizingRight(true);
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          // Prevent iframes from capturing mouse events during resize
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach((iframe) => {
            (iframe as HTMLElement).style.pointerEvents = 'none';
          });
        }}
      />

      {/* Right Panel - Chat Only */}
      <div
        className="border-l border-gray-700"
        style={{ width: `${rightPanelWidth}px` }}
      >
        {currentProject ? (
          <ChatPanel
            projectId={currentProject.id}
            onFileChange={handleFileChange}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg mb-2">💬</p>
              <p className="text-sm">Select a project to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export default App;
