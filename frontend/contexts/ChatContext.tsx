"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface PendingPrompt {
  content: string;
  timestamp: number;
}

function generateSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface ChatContextType {
  messages: ChatMessage[];
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  pendingPrompt: PendingPrompt | null;
  setPendingPrompt: (prompt: PendingPrompt | null) => void;
  chatSessionId: string;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessagesState] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant' as const,
      content: `Welcome to Stacy, I'm your AI assistant. I'm ready to help you build Stellar smart contracts and frontends.`,
      timestamp: Date.now(),
    },
  ]);

  const [chatSessionId] = useState<string>(generateSessionId);
  const [pendingPrompt, setPendingPromptState] = useState<PendingPrompt | null>(null);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    setMessagesState((prev) => [...prev, newMessage]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessagesState([{
      id: 'welcome',
      role: 'assistant',
      content: `Welcome to Stacy, I'm your AI assistant. I'm ready to help you build Stellar smart contracts and frontends.`,
      timestamp: Date.now(),
    }]);
  }, []);

  const setMessages = useCallback((newMessages: ChatMessage[]) => {
    setMessagesState(newMessages);
  }, []);

  const setPendingPrompt = useCallback((prompt: PendingPrompt | null) => {
    setPendingPromptState(prompt);
  }, []);

  return (
    <ChatContext.Provider value={{ messages, addMessage, clearMessages, setMessages, pendingPrompt, setPendingPrompt, chatSessionId }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}
