/**
 * Chat Panel Component
 * Chat interface for Claude Code interaction with persistent history
 */

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

interface ChatPanelProps {
  projectId: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Simple unique ID generator
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function ChatPanel({ projectId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from database
  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await axios.get(`${API_BASE_URL}/chat/sessions/${projectId}/history`);

      if (response.data.success && response.data.messages.length > 0) {
        // Convert database messages to UI format
        const historyMessages: Message[] = response.data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }));
        console.log('Loaded messages:', historyMessages.map(m => ({ id: m.id, role: m.role })));
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

    socket.on('ai-response', (data: { message: string }) => {
      setIsTyping(false);
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

    socket.on('ai-typing', () => {
      setIsTyping(true);
    });

    socket.on('ai-error', (data: { error: string }) => {
      setIsTyping(false);
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

  const handleSend = () => {
    if (!input.trim() || !socketRef.current || !isConnected) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    socketRef.current.emit('ai-message', {
      projectId,
      message: input,
    });

    setInput('');
    setIsTyping(true);
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
            <div className={`max-w-[80%] rounded-lg p-3 ${getMessageStyle(message.role)}`}>
              <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                }`}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>
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
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              isConnected ? 'Ask Claude Code anything...' : 'Connecting to chat...'
            }
            disabled={!isConnected}
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !isConnected || isTyping}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-medium self-end"
          >
            Send
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
