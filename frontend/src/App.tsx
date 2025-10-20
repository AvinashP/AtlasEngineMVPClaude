/**
 * AtlasEngine MVP - Main Application
 * Modern tabbed layout: File Explorer | Tabbed Editor/Preview/Memory | Chat
 */

import { useState, useEffect } from 'react';
import FileTree from './components/FileTree';
import CodeEditor from './components/CodeEditor';
import PreviewPanel from './components/PreviewPanel';
import MemoryPanel from './components/MemoryPanel';
import ChatPanel from './components/ChatPanel';
import { projectApi } from './services/api';
import type { Project } from './types';

interface Tab {
  id: string;
  type: 'file' | 'preview' | 'memory';
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

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Auto-open Preview and Memory tabs when project loads
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
      setTabs([previewTab, memoryTab]);
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
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project');
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
      console.log('File saved successfully');
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file');
    }
  };

  const handleCloseTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);

    // Don't allow closing Preview and Memory tabs
    if (tab?.id === 'preview' || tab?.id === 'memory') {
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

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Left Panel - File Explorer */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
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
            <FileTree projectId={currentProject.id} onSelectFile={handleSelectFile} />
          ) : (
            <div className="p-4 text-gray-500 text-sm">
              No project selected
            </div>
          )}
        </div>
      </div>

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
            <PreviewPanel projectId={currentProject.id} />
          )}
          {activeTab?.type === 'memory' && currentProject && (
            <MemoryPanel projectId={currentProject.id} />
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

      {/* Right Panel - Chat Only */}
      <div className="w-96 border-l border-gray-700">
        {currentProject ? (
          <ChatPanel projectId={currentProject.id} />
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
  );
}

export default App;
