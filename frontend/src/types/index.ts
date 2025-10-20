// Project types
export interface Project {
  id: string;
  sessionId: string;
  name: string;
  description?: string;
  framework?: string;
  language?: string;
  hasMemory: boolean;
  memorySize?: number;
  status: 'active' | 'archived' | 'deleted';
  createdAt: string;
  updatedAt: string;
  lastAccessed?: string;
}

// Build types
export interface Build {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  buildLogs?: string;
  errorMessage?: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationSeconds?: number;
}

// Preview types
export interface Preview {
  id: string;
  projectId: string;
  containerId: string;
  containerName: string;
  host: string;
  port: number;
  status: 'starting' | 'healthy' | 'unhealthy' | 'stopped' | 'failed';
  url: string;
  createdAt: string;
}

// Memory types
export interface MemoryStats {
  currentSize: number;
  totalSnapshots: number;
  checkpoints: number;
  autoSnapshots: number;
  lastUpdate?: string;
}

export interface MemoryHealth {
  healthy: boolean;
  fileSize?: number;
  totalSnapshots?: number;
  lastUpdate?: string;
  recommendations?: string[];
}

// File types
export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

// Quota types
export interface QuotaSummary {
  tokens: {
    used: number;
    limit: number;
    percentage: string;
    remaining: number;
  };
  cost: {
    used: number;
    limit: number;
    percentage: string;
    remaining: string;
  };
  requests: {
    thisHour: number;
    limit: number;
  };
  containers: {
    limit: number;
  };
  status: {
    exceeded: boolean;
    reason?: string;
  };
}
