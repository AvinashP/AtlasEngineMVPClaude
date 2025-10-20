/**
 * File Tree Component
 * Displays project files and folders
 */

import { useState, useEffect } from 'react';
import { projectApi } from '@/services/api';
import type { FileItem } from '@/types';

interface FileTreeProps {
  projectId: string;
  onSelectFile: (path: string, content: string) => void;
}

function FileTree({ projectId, onSelectFile }: FileTreeProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    loadFiles('');
  }, [projectId]);

  const loadFiles = async (path: string) => {
    setLoading(true);
    try {
      const response = await projectApi.listFiles(projectId, path);
      setFiles(response.files);
      setCurrentPath(path);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = async (file: FileItem) => {
    if (file.type === 'directory') {
      const folderPath = file.path;
      if (expandedFolders.has(folderPath)) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.delete(folderPath);
          return next;
        });
      } else {
        setExpandedFolders((prev) => new Set(prev).add(folderPath));
        // Load files in this directory
        await loadFiles(file.path);
      }
    } else {
      // Load file content
      try {
        const response = await projectApi.getFileContent(projectId, file.path);
        onSelectFile(file.path, response.content);
      } catch (error) {
        console.error('Failed to load file:', error);
      }
    }
  };

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'directory') {
      return expandedFolders.has(file.path) ? '📂' : '📁';
    }

    const ext = file.name.split('.').pop();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return '🔷';
      case 'js':
      case 'jsx':
        return '🟨';
      case 'json':
        return '📋';
      case 'md':
        return '📝';
      case 'css':
        return '🎨';
      default:
        return '📄';
    }
  };

  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-2">
      {currentPath && (
        <button
          onClick={() => {
            const parentPath = currentPath.split('/').slice(0, -1).join('/');
            loadFiles(parentPath);
          }}
          className="w-full text-left px-2 py-1 hover:bg-gray-700 rounded text-sm mb-2 text-gray-400"
        >
          ← Back
        </button>
      )}

      {files.length === 0 ? (
        <div className="text-gray-500 text-sm p-2">No files yet</div>
      ) : (
        <div className="space-y-1">
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => handleFileClick(file)}
              className="w-full text-left px-2 py-1 hover:bg-gray-700 rounded text-sm flex items-center gap-2"
            >
              <span>{getFileIcon(file)}</span>
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileTree;
