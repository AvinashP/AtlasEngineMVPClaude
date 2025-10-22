/**
 * Preview Tab Container
 * Manages tabs for Preview and Build panels
 */

import { useState } from 'react';
import PreviewPanel from './PreviewPanel';
import BuildPanel from './BuildPanel';

interface PreviewTabContainerProps {
  projectId: string;
  refreshKey: number;
}

type TabType = 'preview' | 'build';

function PreviewTabContainer({ projectId, refreshKey }: PreviewTabContainerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preview');

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'preview'
              ? 'bg-gray-900 text-white border-b-2 border-blue-500'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-750'
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => setActiveTab('build')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'build'
              ? 'bg-gray-900 text-white border-b-2 border-blue-500'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-750'
          }`}
        >
          Build & Deploy
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'preview' && (
          <PreviewPanel projectId={projectId} refreshKey={refreshKey} />
        )}
        {activeTab === 'build' && (
          <BuildPanel projectId={projectId} />
        )}
      </div>
    </div>
  );
}

export default PreviewTabContainer;
