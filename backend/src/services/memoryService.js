/**
 * Memory Management Service
 * Manages CLAUDE.md files for persistent AI context across sessions
 *
 * This is the core differentiator of AtlasEngine - enables unlimited session continuity
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  createMemorySnapshot,
  getProjectMemorySnapshots,
  updateProjectMemory
} from '../db/queries.js';

class MemoryService {
  constructor() {
    this.claudeFileName = 'CLAUDE.md';
    this.claudeDir = '.claude';
  }

  /**
   * Initialize CLAUDE.md for a new project
   * @param {string} projectId - Project UUID
   * @param {string} projectPath - Filesystem path to project
   * @param {string} projectName - Human-readable project name
   * @param {string} userId - User UUID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Initialization result
   */
  async initializeMemory(projectId, projectPath, projectName, userId, options = {}) {
    try {
      const claudeMdPath = path.join(projectPath, this.claudeFileName);
      const claudeDirPath = path.join(projectPath, this.claudeDir);

      // Create .claude directory for additional memory files
      await fs.mkdir(claudeDirPath, { recursive: true });

      // Generate initial CLAUDE.md content
      const template = this.generateTemplate(projectName, options);

      // Write CLAUDE.md file
      await fs.writeFile(claudeMdPath, template, 'utf8');

      // Calculate size
      const stats = await fs.stat(claudeMdPath);
      const sizeBytes = stats.size;

      // Create snapshot in database
      const contentHash = this.hashContent(template);
      await createMemorySnapshot({
        projectId,
        userId,
        kind: 'claude_md',
        path: this.claudeFileName,
        content: template,
        contentHash,
        notes: 'Initial memory initialization'
      });

      // Update project memory status
      await updateProjectMemory(projectId, sizeBytes);

      console.log(`✅ Memory initialized for project ${projectId}`);

      return {
        success: true,
        path: claudeMdPath,
        size: sizeBytes,
        snapshot: true
      };
    } catch (error) {
      console.error('Error initializing memory:', error);
      throw error;
    }
  }

  /**
   * Generate CLAUDE.md template
   * @param {string} projectName - Project name
   * @param {Object} options - Template options
   * @returns {string} Template content
   */
  generateTemplate(projectName, options = {}) {
    const timestamp = new Date().toISOString();
    const { framework, language, description } = options;

    return `# Project: ${projectName}

## Overview
${description || 'AI will analyze and fill this section after initial code scan'}

## Tech Stack
${framework ? `- Framework: ${framework}` : '- Framework: To be detected'}
${language ? `- Language: ${language}` : '- Language: To be detected'}
- Additional dependencies will be documented as discovered

## Architecture
[High-level architecture will be documented as we build]

## Key Decisions
- ${timestamp}: Project initialized with AtlasEngine
${framework ? `- ${timestamp}: Using ${framework} as primary framework` : ''}

## Coding Conventions
[To be established during development based on codebase patterns]

## Current Status
Last updated: ${timestamp}
- 🚧 Project just started
- 📋 Ready for initial implementation

## Known Issues
[None yet - will be documented as discovered]

## Dependencies
[Package dependencies will be listed here after installation]

## Environment Variables
[Required environment variables will be documented here]

## Build & Deploy
[Build and deployment instructions to be added]

## Development Notes
- Project created via AtlasEngine MVP
- Memory system active for session continuity
- AI context preserved across unlimited sessions

---
*This file is automatically managed by AtlasEngine's memory system*
*Last memory snapshot: ${timestamp}*
`;
  }

  /**
   * Update CLAUDE.md with new information
   * @param {string} projectId - Project UUID
   * @param {string} projectPath - Filesystem path to project
   * @param {string} userId - User UUID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<boolean>} Success status
   */
  async updateMemory(projectId, projectPath, userId, updates) {
    try {
      const claudeMdPath = path.join(projectPath, this.claudeFileName);

      // Read current content
      let content = await fs.readFile(claudeMdPath, 'utf8');

      // Apply updates
      if (updates.decisions) {
        const decision = `- ${new Date().toISOString()}: ${updates.decisions}`;
        content = this.appendToSection(content, '## Key Decisions', decision);
      }

      if (updates.status) {
        const statusUpdate = `Last updated: ${new Date().toISOString()}\n${updates.status}`;
        content = this.updateSection(content, '## Current Status', statusUpdate);
      }

      if (updates.issues) {
        const issue = `- ${updates.issues}`;
        content = this.appendToSection(content, '## Known Issues', issue);
      }

      if (updates.conventions) {
        const convention = `- ${updates.conventions}`;
        content = this.appendToSection(content, '## Coding Conventions', convention);
      }

      if (updates.architecture) {
        content = this.updateSection(content, '## Architecture', updates.architecture);
      }

      if (updates.dependencies) {
        content = this.updateSection(content, '## Dependencies', updates.dependencies);
      }

      if (updates.techStack) {
        content = this.updateSection(content, '## Tech Stack', updates.techStack);
      }

      if (updates.overview) {
        content = this.updateSection(content, '## Overview', updates.overview);
      }

      // Update memory snapshot timestamp footer
      content = content.replace(
        /\*Last memory snapshot: .*\*/,
        `*Last memory snapshot: ${new Date().toISOString()}*`
      );

      // Write updated content
      await fs.writeFile(claudeMdPath, content, 'utf8');

      // Calculate new size
      const stats = await fs.stat(claudeMdPath);
      const sizeBytes = stats.size;

      // Create auto-snapshot
      const contentHash = this.hashContent(content);
      await createMemorySnapshot({
        projectId,
        userId,
        kind: 'auto',
        path: this.claudeFileName,
        content,
        contentHash,
        notes: 'Automatic update snapshot'
      });

      // Update project memory size
      await updateProjectMemory(projectId, sizeBytes);

      console.log(`✅ Memory updated for project ${projectId}`);

      return true;
    } catch (error) {
      console.error('Error updating memory:', error);
      return false;
    }
  }

  /**
   * Create a named checkpoint
   * @param {string} projectId - Project UUID
   * @param {string} projectPath - Filesystem path to project
   * @param {string} userId - User UUID
   * @param {string} checkpointName - Name for this checkpoint
   * @param {string} notes - Optional notes
   * @returns {Promise<Object>} Checkpoint result
   */
  async createCheckpoint(projectId, projectPath, userId, checkpointName, notes = '') {
    try {
      const claudeMdPath = path.join(projectPath, this.claudeFileName);
      const content = await fs.readFile(claudeMdPath, 'utf8');
      const contentHash = this.hashContent(content);

      const snapshot = await createMemorySnapshot({
        projectId,
        userId,
        kind: 'checkpoint',
        path: this.claudeFileName,
        content,
        contentHash,
        notes: `Checkpoint: ${checkpointName}${notes ? ' - ' + notes : ''}`
      });

      console.log(`✅ Checkpoint created: ${checkpointName}`);

      return {
        success: true,
        checkpointName,
        snapshotId: snapshot.id,
        timestamp: snapshot.created_at
      };
    } catch (error) {
      console.error('Error creating checkpoint:', error);
      throw error;
    }
  }

  /**
   * Get memory content
   * @param {string} projectPath - Filesystem path to project
   * @returns {Promise<string|null>} Memory content or null
   */
  async getMemoryContent(projectPath) {
    try {
      const claudeMdPath = path.join(projectPath, this.claudeFileName);
      const content = await fs.readFile(claudeMdPath, 'utf8');
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      console.error('Error reading memory:', error);
      throw error;
    }
  }

  /**
   * Get memory statistics
   * @param {string} projectId - Project UUID
   * @param {string} projectPath - Filesystem path to project
   * @returns {Promise<Object>} Memory statistics
   */
  async getMemoryStats(projectId, projectPath) {
    try {
      const snapshots = await getProjectMemorySnapshots(projectId, 100);

      const stats = {
        totalSnapshots: snapshots.length,
        checkpoints: snapshots.filter(s => s.kind === 'checkpoint').length,
        autoSnapshots: snapshots.filter(s => s.kind === 'auto').length,
        totalSize: snapshots.reduce((sum, s) => sum + s.size_bytes, 0),
        lastUpdate: snapshots.length > 0 ? snapshots[0].created_at : null,
        oldestSnapshot: snapshots.length > 0 ? snapshots[snapshots.length - 1].created_at : null
      };

      // Get current file size
      try {
        const claudeMdPath = path.join(projectPath, this.claudeFileName);
        const fileStats = await fs.stat(claudeMdPath);
        stats.currentSize = fileStats.size;
      } catch (error) {
        stats.currentSize = 0;
      }

      return stats;
    } catch (error) {
      console.error('Error getting memory stats:', error);
      throw error;
    }
  }

  /**
   * Compact memory (remove old auto-snapshots, keep checkpoints)
   * @param {string} projectId - Project UUID
   * @param {number} keepLastN - Number of auto-snapshots to keep
   * @returns {Promise<number>} Number of snapshots removed
   */
  async compactMemory(projectId, keepLastN = 5) {
    try {
      const snapshots = await getProjectMemorySnapshots(projectId, 1000);

      // Separate auto-snapshots from checkpoints
      const autoSnapshots = snapshots.filter(s => s.kind === 'auto');
      const checkpoints = snapshots.filter(s => s.kind === 'checkpoint');

      // Keep only last N auto-snapshots
      const toDelete = autoSnapshots.slice(keepLastN);

      // Delete old auto-snapshots
      // Note: In a full implementation, we'd need a deleteMemorySnapshot function in queries.js
      // For now, we'll just log the intent
      console.log(`Would delete ${toDelete.length} old auto-snapshots`);
      console.log(`Keeping ${keepLastN} recent auto-snapshots and all ${checkpoints.length} checkpoints`);

      return toDelete.length;
    } catch (error) {
      console.error('Error compacting memory:', error);
      throw error;
    }
  }

  /**
   * Restore memory from a snapshot
   * @param {string} projectPath - Filesystem path to project
   * @param {Object} snapshot - Snapshot object from database
   * @returns {Promise<boolean>} Success status
   */
  async restoreFromSnapshot(projectPath, snapshot) {
    try {
      const claudeMdPath = path.join(projectPath, this.claudeFileName);

      // Create backup of current version
      try {
        const currentContent = await fs.readFile(claudeMdPath, 'utf8');
        const backupPath = path.join(projectPath, this.claudeDir, `CLAUDE.backup.${Date.now()}.md`);
        await fs.writeFile(backupPath, currentContent, 'utf8');
        console.log(`Created backup at ${backupPath}`);
      } catch (error) {
        // Backup failed but continue with restore
        console.warn('Could not create backup:', error.message);
      }

      // Restore from snapshot
      await fs.writeFile(claudeMdPath, snapshot.content, 'utf8');

      console.log(`✅ Memory restored from snapshot ${snapshot.id}`);

      return true;
    } catch (error) {
      console.error('Error restoring memory:', error);
      throw error;
    }
  }

  /**
   * Append content to a section
   * @param {string} content - Full document content
   * @param {string} sectionHeader - Section header (e.g., "## Key Decisions")
   * @param {string} newLine - Line to append
   * @returns {string} Updated content
   */
  appendToSection(content, sectionHeader, newLine) {
    const sectionRegex = new RegExp(`(${sectionHeader}[\\s\\S]*?)(\n## |$)`, 'm');
    const match = content.match(sectionRegex);

    if (match) {
      const updatedSection = match[1].trimEnd() + '\n' + newLine + '\n';
      return content.replace(match[1], updatedSection);
    }

    // Section not found, append at end
    return content + `\n${sectionHeader}\n${newLine}\n`;
  }

  /**
   * Update entire section
   * @param {string} content - Full document content
   * @param {string} sectionHeader - Section header
   * @param {string} newContent - New section content
   * @returns {string} Updated content
   */
  updateSection(content, sectionHeader, newContent) {
    const sectionRegex = new RegExp(
      `(${sectionHeader})([\\s\\S]*?)(\n## |$)`,
      'm'
    );

    const match = content.match(sectionRegex);

    if (match) {
      return content.replace(sectionRegex, `$1\n${newContent}\n\n$3`);
    }

    // Section not found, append at end
    return content + `\n${sectionHeader}\n${newContent}\n`;
  }

  /**
   * Hash content for deduplication
   * @param {string} content - Content to hash
   * @returns {string} SHA256 hash
   */
  hashContent(content) {
    return crypto
      .createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');
  }

  /**
   * Check if memory exists for a project
   * @param {string} projectPath - Filesystem path to project
   * @returns {Promise<boolean>} True if memory exists
   */
  async memoryExists(projectPath) {
    try {
      const claudeMdPath = path.join(projectPath, this.claudeFileName);
      await fs.access(claudeMdPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Analyze memory health
   * @param {string} projectId - Project UUID
   * @param {string} projectPath - Filesystem path to project
   * @returns {Promise<Object>} Health analysis
   */
  async analyzeMemoryHealth(projectId, projectPath) {
    try {
      const exists = await this.memoryExists(projectPath);

      if (!exists) {
        return {
          healthy: false,
          reason: 'CLAUDE.md file not found',
          recommendations: ['Initialize memory with memoryService.initializeMemory()']
        };
      }

      const content = await this.getMemoryContent(projectPath);
      const stats = await this.getMemoryStats(projectId, projectPath);

      const analysis = {
        healthy: true,
        fileSize: stats.currentSize,
        totalSnapshots: stats.totalSnapshots,
        lastUpdate: stats.lastUpdate,
        recommendations: []
      };

      // Check if file is too large
      if (stats.currentSize > 100000) { // 100KB
        analysis.recommendations.push('Consider compacting memory - file is getting large');
      }

      // Check if no recent updates
      const daysSinceUpdate = stats.lastUpdate
        ? (Date.now() - new Date(stats.lastUpdate).getTime()) / (1000 * 60 * 60 * 24)
        : null;

      if (daysSinceUpdate && daysSinceUpdate > 7) {
        analysis.recommendations.push('No updates in 7+ days - consider refreshing project status');
      }

      // Check if few checkpoints
      if (stats.checkpoints < 3 && stats.totalSnapshots > 10) {
        analysis.recommendations.push('Create more named checkpoints for important milestones');
      }

      // Check if too many auto-snapshots
      if (stats.autoSnapshots > 20) {
        analysis.recommendations.push('Run compactMemory() to clean up old auto-snapshots');
      }

      return analysis;
    } catch (error) {
      console.error('Error analyzing memory health:', error);
      throw error;
    }
  }
}

// Export singleton instance
const memoryService = new MemoryService();
export default memoryService;
