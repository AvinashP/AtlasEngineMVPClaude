/**
 * Chat Panel Component
 * Chat interface for Claude Code interaction with persistent history
 */

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatApi, type UploadedFile } from '@/services/api';
import toast from 'react-hot-toast';

interface ChatPanelProps {
  projectId: string;
  onFileChange?: () => void; // Callback when files are modified
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isToolUse?: boolean;
  toolName?: string;
  toolInput?: any;
  toolId?: string;
  attachments?: UploadedFile[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Simple unique ID generator
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function ChatPanel({ projectId, onFileChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileOperationsOccurredRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load chat history from database
  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await axios.get(`${API_BASE_URL}/chat/sessions/${projectId}/history`);

      if (response.data.success && response.data.messages.length > 0) {
        // Convert database messages to UI format
        const historyMessages: Message[] = [];

        for (const msg of response.data.messages) {
          // Check if message has tool use events in meta
          if (msg.meta && msg.meta.toolUseEvents && Array.isArray(msg.meta.toolUseEvents)) {
            // Create separate messages for each tool use event
            for (const toolEvent of msg.meta.toolUseEvents) {
              historyMessages.push({
                id: `${msg.id}-tool-${toolEvent.id}`,
                role: 'assistant',
                content: '',
                timestamp: new Date(msg.created_at),
                isToolUse: true,
                toolName: toolEvent.name,
                toolInput: toolEvent.input,
                toolId: toolEvent.id,
              });
            }
          }

          // Add the main message (text content)
          if (msg.content && msg.content.trim()) {
            historyMessages.push({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.created_at),
            });
          }
        }

        console.log('Loaded messages:', historyMessages.map(m => ({
          id: m.id,
          role: m.role,
          isToolUse: m.isToolUse,
          toolName: m.toolName
        })));
        setMessages(historyMessages);
      } else {
        // No history, show welcome message
        setMessages([
          {
            id: 'welcome',
            role: 'system',
            content: 'Connected to Claude Code. Ask me anything about your project!',
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      // Show welcome message on error
      setMessages([
        {
          id: 'welcome',
          role: 'system',
          content: 'Connected to Claude Code. Ask me anything about your project!',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    // Initialize Socket.IO connection
    // Extract base URL without /api path for WebSocket connection
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
    const wsUrl = apiBaseUrl.replace(/\/api$/, '');

    const socket = io(wsUrl, {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-project', projectId);

      // Load chat history from database
      loadHistory();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Handle AI typing indicator
    socket.on('ai-typing', () => {
      setIsTyping(true);
      setIsProcessing(true);
      setCurrentActivity('Processing your request...');
    });

    // Handle streaming events from Claude CLI
    socket.on('claude-stream-event', (data: { type: string; data: any }) => {
      // Keep typing indicator visible while processing
      // Don't set isTyping to false here - let it stay until completion

      if (data.type === 'text') {
        // Stream text content - append to current streaming message
        setCurrentActivity('Writing response...');
        setMessages((prev) => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];

          if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming && !lastMessage.isToolUse) {
            // Append to existing streaming message
            lastMessage.content += data.data.text;
          } else {
            // Create new streaming message
            updated.push({
              id: generateId(),
              role: 'assistant',
              content: data.data.text,
              timestamp: new Date(),
              isStreaming: true,
            });
          }
          return updated;
        });
      } else if (data.type === 'tool_use') {
        // Tool use event - create a tool message
        setCurrentActivity(`Using ${data.data.name}...`);
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isToolUse: true,
            toolName: data.data.name,
            toolInput: data.data.input,
            toolId: data.data.id,
          },
        ]);

        // Track if this is a file operation tool
        const fileOperationTools = ['Write', 'Edit', 'NotebookEdit'];
        if (fileOperationTools.includes(data.data.name)) {
          fileOperationsOccurredRef.current = true;
        }
      }
    });

    // Handle completion
    socket.on('claude-complete', (data: { tokensUsed: number; model: string; exitCode: number }) => {
      setIsTyping(false);
      setIsProcessing(false);
      setCurrentActivity('');

      // Mark streaming message as complete
      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];

        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
          lastMessage.isStreaming = false;
        }
        return updated;
      });

      // If file operations occurred, notify parent with a small delay to ensure files are written
      if (fileOperationsOccurredRef.current) {
        console.log('File operations detected - triggering preview refresh');
        setTimeout(() => {
          if (onFileChange) {
            onFileChange();
          }
        }, 500); // 500ms delay to ensure files are fully written to disk
        fileOperationsOccurredRef.current = false; // Reset for next request
      }
    });

    // Keep old ai-response handler for backward compatibility
    socket.on('ai-response', (data: { message: string }) => {
      setIsTyping(false);
      setIsProcessing(false);
      setCurrentActivity('');
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date(),
        },
      ]);
    });

    // Handle errors
    socket.on('ai-error', (data: { error: string }) => {
      setIsTyping(false);
      setIsProcessing(false);
      setCurrentActivity('');
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'system',
          content: `Error: ${data.error}`,
          timestamp: new Date(),
        },
      ]);
    });

    return () => {
      socket.disconnect();
    };
  }, [projectId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !socketRef.current || !isConnected) return;

    // Reset file operations flag for new request
    fileOperationsOccurredRef.current = false;

    try {
      // Upload files first if any are selected
      let attachmentPaths: string[] = [];
      if (selectedFiles.length > 0) {
        setIsUploading(true);
        const uploadResult = await chatApi.uploadFiles(projectId, selectedFiles);
        attachmentPaths = uploadResult.files.map((f) => f.path);
        toast.success(`Uploaded ${uploadResult.count} file(s)`);
      }

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: input,
        timestamp: new Date(),
        attachments: selectedFiles.length > 0 ? uploadedAttachments : undefined,
      };

      setMessages((prev) => [...prev, userMessage]);
      socketRef.current.emit('ai-message', {
        projectId,
        message: input,
        attachments: attachmentPaths, // Send file paths to backend
      });

      setInput('');
      setSelectedFiles([]);
      setUploadedAttachments([]);
      setIsTyping(true);
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast.error(`Failed to send message: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getMessageStyle = (role: string) => {
    switch (role) {
      case 'user':
        return 'bg-blue-600 text-white ml-auto';
      case 'assistant':
        return 'bg-gray-700 text-gray-100';
      case 'system':
        return 'bg-yellow-900 text-yellow-200 text-center';
      default:
        return 'bg-gray-700 text-gray-100';
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleClearChat = async () => {
    if (!confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/chat/sessions/${projectId}/history`);
      setMessages([
        {
          id: 'welcome',
          role: 'system',
          content: 'Chat history cleared. Start a new conversation!',
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'system',
          content: 'Error: Failed to clear chat history',
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleStop = () => {
    if (!socketRef.current) return;

    // Send stop signal to backend
    socketRef.current.emit('ai-stop', { projectId });

    // Update UI state
    setIsProcessing(false);
    setIsTyping(false);
    setCurrentActivity('');

    // Add system message indicating stop
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: 'system',
        content: 'Request stopped by user',
        timestamp: new Date(),
      },
    ]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    validateAndAddFiles(files);
  };

  const validateAndAddFiles = (files: File[]) => {
    const maxSize = 3.75 * 1024 * 1024; // 3.75 MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxFiles = 20;

    const validFiles = files.filter((file) => {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Invalid file type. Only JPEG, PNG, GIF, and WebP allowed.`);
        return false;
      }
      if (file.size > maxSize) {
        toast.error(`${file.name}: File size exceeds 3.75 MB limit.`);
        return false;
      }
      return true;
    });

    if (selectedFiles.length + validFiles.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed. Please remove some files.`);
      return;
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    validateAndAddFiles(files);
  };

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Claude Code Chat</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearChat}
            disabled={messages.length === 0 || isLoadingHistory}
            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded"
            title="Clear chat history"
          >
            Clear
          </button>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
            ></div>
            <span className="text-xs text-gray-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {isLoadingHistory && (
          <div className="text-center text-gray-500 text-sm mt-8">
            <p className="mb-2">Loading chat history...</p>
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-8">
            <p className="mb-2">No messages yet</p>
            <p className="text-xs">
              Start a conversation with Claude Code to get help with your project
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.isToolUse ? (
              // Tool use message display
              <div className="max-w-[80%] bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium text-blue-300">Using {message.toolName}</span>
                </div>
                {message.toolInput && (
                  <details className="mt-2">
                    <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                      View parameters
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-900 p-2 rounded text-blue-200 overflow-x-auto">
                      {JSON.stringify(message.toolInput, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="text-xs mt-2 text-gray-400">
                  {formatTime(message.timestamp)}
                </div>
              </div>
            ) : (
              // Normal text message display with markdown support
              <div className={`max-w-[80%] rounded-lg p-3 ${getMessageStyle(message.role)}`}>
                <div className="text-sm prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Paragraph
                      p: ({children, node}) => {
                        // Check if paragraph is inside a list item
                        const isInListItem = node?.position?.start?.column > 1;
                        return isInListItem ?
                          <>{children}</> :
                          <p className="mb-2 last:mb-0">{children}</p>;
                      },
                      // Headings
                      h1: ({children}) => <h1 className="text-xl font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                      h2: ({children}) => <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                      h3: ({children}) => <h3 className="text-base font-bold mb-2 mt-2 first:mt-0">{children}</h3>,
                      // Lists
                      ul: ({children}) => <ul className="list-disc list-outside mb-2 ml-4 space-y-0.5">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal list-outside mb-2 ml-4 space-y-0.5">{children}</ol>,
                      li: ({children}) => <li className="leading-relaxed">{children}</li>,
                      // Code
                      code: ({inline, children, ...props}: any) =>
                        inline ? (
                          <code className="px-1.5 py-0.5 bg-gray-700 rounded text-blue-300 font-mono text-xs" {...props}>
                            {children}
                          </code>
                        ) : (
                          <code className="font-mono text-xs" {...props}>
                            {children}
                          </code>
                        ),
                      pre: ({children}) => <pre className="bg-gray-900 rounded p-3 overflow-x-auto my-2 text-sm">{children}</pre>,
                      // Blockquote
                      blockquote: ({children}) => (
                        <blockquote className="border-l-4 border-blue-500 pl-3 italic text-gray-300 my-2">
                          {children}
                        </blockquote>
                      ),
                      // Links
                      a: ({children, href}) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          {children}
                        </a>
                      ),
                      // Tables
                      table: ({children}) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full border-collapse border border-gray-600">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({children}) => <thead className="bg-gray-700">{children}</thead>,
                      th: ({children}) => <th className="border border-gray-600 px-3 py-2 text-left">{children}</th>,
                      td: ({children}) => <td className="border border-gray-600 px-3 py-2">{children}</td>,
                      // Strong and emphasis
                      strong: ({children}) => <strong className="font-bold text-gray-100">{children}</strong>,
                      em: ({children}) => <em className="italic text-gray-200">{children}</em>,
                      // Horizontal rule
                      hr: () => <hr className="border-gray-600 my-3" />,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse"></span>
                  )}
                </div>
                <div
                  className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                  }`}
                >
                  {formatTime(message.timestamp)}
                </div>
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-lg p-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700" onDragOver={handleDragOver} onDrop={handleDrop}>
        {/* File Attachments Preview */}
        {selectedFiles.length > 0 && (
          <div className="mb-3 flex gap-2 flex-wrap">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="relative bg-gray-900 border border-gray-700 rounded p-2 flex items-center gap-2"
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-12 h-12 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 truncate">{file.name}</div>
                  <div className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="text-gray-400 hover:text-red-400"
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex gap-2">
          {/* File attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected || isProcessing || isUploading}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded text-sm self-end"
            title="Attach images"
          >
            📎
          </button>

          <textarea
            value={isProcessing ? '' : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              isProcessing
                ? currentActivity
                : isConnected
                ? 'Ask Claude Code anything...'
                : 'Connecting to chat...'
            }
            disabled={!isConnected || isProcessing || isUploading}
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-75"
            rows={3}
          />
          {isProcessing ? (
            <button
              onClick={handleStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium self-end"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!input.trim() && selectedFiles.length === 0) || !isConnected || isUploading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-medium self-end"
            >
              {isUploading ? 'Uploading...' : 'Send'}
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {isProcessing
            ? 'Claude is working...'
            : isUploading
            ? 'Uploading files...'
            : selectedFiles.length > 0
            ? `${selectedFiles.length} file(s) selected • Press Enter to send, Shift+Enter for new line`
            : 'Press Enter to send, Shift+Enter for new line • Drag & drop images here'}
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
