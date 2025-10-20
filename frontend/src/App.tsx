/**
 * AtlasEngine MVP - Main Application
 * Three-panel layout: File Tree | Code Editor | Preview/Memory
 */

import { useState, useEffect } from 'react';
import FileTree from './components/FileTree';
import CodeEditor from './components/CodeEditor';
import PreviewPanel from './components/PreviewPanel';
import MemoryPanel from './components/MemoryPanel';
import ChatPanel from './components/ChatPanel';
import { projectApi } from './services/api';
import type { Project } from './types';

function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentFile, setCurrentFile] = useState<{ path: string; content: string } | null>(null);
  const [rightPanel, setRightPanel] = useState<'preview' | 'memory' | 'chat'>('preview');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

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
    setCurrentFile({ path, content });
  };

  const handleSaveFile = async (content: string) => {
    if (!currentProject || !currentFile) return;

    try {
      await projectApi.updateFileContent(currentProject.id, currentFile.path, content);
      setCurrentFile({ ...currentFile, content });
      console.log('File saved successfully');
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file');
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Sidebar - Project Selector */}
      <div className="w-12 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-2">
        <button
          onClick={() => setRightPanel('preview')}
          className={`w-10 h-10 mb-2 rounded ${
            rightPanel === 'preview' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
          } flex items-center justify-center`}
          title="Preview"
        >
          👁
        </button>
        <button
          onClick={() => setRightPanel('memory')}
          className={`w-10 h-10 mb-2 rounded ${
            rightPanel === 'memory' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
          } flex items-center justify-center`}
          title="Memory"
        >
          🧠
        </button>
        <button
          onClick={() => setRightPanel('chat')}
          className={`w-10 h-10 mb-2 rounded ${
            rightPanel === 'chat' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
          } flex items-center justify-center`}
          title="Chat"
        >
          💬
        </button>
        <div className="flex-1"></div>
        <button
          onClick={handleCreateProject}
          disabled={isCreatingProject}
          className="w-10 h-10 rounded bg-green-600 hover:bg-green-700 flex items-center justify-center"
          title="New Project"
        >
          +
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Panel - File Tree */}
        <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700">
            <select
              value={currentProject?.id || ''}
              onChange={(e) => {
                const project = projects.find((p) => p.id === e.target.value);
                setCurrentProject(project || null);
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

        {/* Center Panel - Code Editor */}
        <div className="flex-1 flex flex-col">
          <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4">
            <span className="text-sm text-gray-400">
              {currentFile ? currentFile.path : 'No file open'}
            </span>
            {currentFile && (
              <button
                onClick={() => handleSaveFile(currentFile.content)}
                className="ml-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                Save
              </button>
            )}
          </div>
          <div className="flex-1">
            <CodeEditor
              value={currentFile?.content || ''}
              onChange={(value) => {
                if (currentFile) {
                  setCurrentFile({ ...currentFile, content: value });
                }
              }}
              language={currentFile?.path.endsWith('.ts') || currentFile?.path.endsWith('.tsx') ? 'typescript' : 'javascript'}
            />
          </div>
        </div>

        {/* Right Panel - Preview/Memory/Chat */}
        <div className="w-1/3 border-l border-gray-700">
          {rightPanel === 'preview' && currentProject && (
            <PreviewPanel projectId={currentProject.id} />
          )}
          {rightPanel === 'memory' && currentProject && (
            <MemoryPanel projectId={currentProject.id} />
          )}
          {rightPanel === 'chat' && currentProject && (
            <ChatPanel projectId={currentProject.id} />
          )}
          {!currentProject && (
            <div className="h-full flex items-center justify-center text-gray-500">
              No project selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
