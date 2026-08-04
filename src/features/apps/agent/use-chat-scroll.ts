import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from './use-agent-chat';

interface ChatScrollState {
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

// 管理消息列表滚动行为，消息变化时自动滚动到底部
export function useChatScroll(messages: ChatMessage[], isStreaming: boolean): ChatScrollState {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const prevCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const isNearBottom = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }, []);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const handleScroll = () => setShowScrollButton(!isNearBottom());
    element.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => element.removeEventListener('scroll', handleScroll);
  }, [isNearBottom]);

  useEffect(() => {
    if (messages.length === 0) return;

    const justLoaded = prevCountRef.current === 0 && messages.length > 0;
    prevCountRef.current = messages.length;

    if (isStreaming) {
      scrollToBottom('auto');
    } else if (justLoaded || isNearBottom()) {
      scrollToBottom('smooth');
    }
  }, [messages, isStreaming, isNearBottom, scrollToBottom]);

  return {
    messagesEndRef,
    scrollContainerRef,
    showScrollButton,
    scrollToBottom,
  };
}
