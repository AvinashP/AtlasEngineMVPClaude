#!/usr/bin/env node

/**
 * Claude Code CLI Wrapper
 * Integrates with actual Claude Code CLI for real AI-powered development
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

// Parse command line arguments
const args = process.argv.slice(2);
let projectPath = '.';
let message = '';
let format = 'json';
let conversationHistory = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-path' && args[i + 1]) {
    projectPath = args[i + 1];
    i++;
  } else if (args[i] === '--message' && args[i + 1]) {
    message = args[i + 1];
    i++;
  } else if (args[i] === '--format' && args[i + 1]) {
    format = args[i + 1];
    i++;
  } else if (args[i] === '--history' && args[i + 1]) {
    try {
      conversationHistory = JSON.parse(args[i + 1]);
    } catch (error) {
      console.error('Failed to parse conversation history:', error.message);
    }
    i++;
  }
}

/**
 * Main wrapper function - integrates with real Claude CLI
 */
async function main() {
  try {
    // Generate or use existing session ID for conversation continuity
    const sessionId = randomUUID();

    // Prepare Claude CLI command
    const claudeArgs = [
      '--print',                          // Non-interactive mode
      '--output-format', 'stream-json',   // Streaming JSON output
      '--verbose',                        // Required for stream-json with --print
      '--dangerously-skip-permissions',   // Auto-accept permissions for automation
      '--session-id', sessionId,          // Session continuity
      message                             // The user's prompt
    ];

    // Spawn Claude Code CLI process
    // Use full path since /opt/homebrew/bin may not be in PATH for spawned processes
    const claudePath = '/opt/homebrew/bin/claude';
    const claudeProcess = spawn(claudePath, claudeArgs, {
      cwd: projectPath,  // Claude auto-loads CLAUDE.md from this directory
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseText = '';
    let tokensUsed = 0;
    let model = 'claude-sonnet-4-5';

    // Handle stdout (streaming JSON responses)
    claudeProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          // Handle different event types from Claude CLI's stream-json format
          switch (event.type) {
            case 'system':
              // Initialization event - contains model info
              if (event.model) {
                model = event.model;
              }
              break;

            case 'assistant':
              // Assistant response event - contains the actual message
              if (event.message) {
                model = event.message.model || model;
                // Extract text from content array - ONLY text content
                if (event.message.content && Array.isArray(event.message.content)) {
                  for (const content of event.message.content) {
                    if (content.type === 'text' && content.text) {
                      // Clear any previous responseText and use ONLY this text
                      // (in case there are multiple assistant events)
                      responseText = content.text;
                    }
                  }
                }
                // Extract token usage
                if (event.message.usage && event.message.usage.output_tokens) {
                  tokensUsed = event.message.usage.output_tokens;
                }
              }
              break;

            case 'result':
              // Final result event - can also extract usage here
              if (event.usage && event.usage.output_tokens) {
                tokensUsed = event.usage.output_tokens;
              }
              if (event.modelUsage && event.modelUsage['claude-sonnet-4-5-20250929']) {
                tokensUsed = event.modelUsage['claude-sonnet-4-5-20250929'].outputTokens || tokensUsed;
              }
              break;
          }
        } catch (error) {
          // Ignore non-JSON lines (don't add them to response)
          // The verbose output contains many non-JSON debug lines that we should skip
        }
      }
    });

    // Handle stderr
    claudeProcess.stderr.on('data', (data) => {
      console.error('Claude CLI stderr:', data.toString());
    });

    // Wait for process to complete
    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Claude CLI exited with code ${code}`));
        }
      });

      claudeProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });

      // Send conversation history via stdin if provided
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          const streamEvent = JSON.stringify({
            type: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }) + '\n';
          claudeProcess.stdin.write(streamEvent);
        }
      }

      // Close stdin to signal we're done sending input
      claudeProcess.stdin.end();
    });

    // Output response in requested format
    if (format === 'json') {
      console.log(JSON.stringify({
        message: responseText.trim() || 'No response from Claude',
        tokensUsed: tokensUsed || estimateTokens(message + responseText),
        model: model,
        timestamp: new Date().toISOString(),
      }));
    } else {
      console.log(responseText.trim() || 'No response from Claude');
    }

    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);

    // Return error as JSON if format is json
    if (format === 'json') {
      console.log(JSON.stringify({
        message: `Error: ${error.message}`,
        tokensUsed: 0,
        model: 'error',
        timestamp: new Date().toISOString(),
      }));
    }

    process.exit(1);
  }
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Run the wrapper
main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
