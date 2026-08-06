import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from './use-agent-chat';

interface ChatScrollState {
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

// 根据容器尺寸判断用户是否仍停留在消息底部附近
export function isScrollNearBottom(metrics: ScrollMetrics, threshold = 80): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < threshold;
}

// 管理消息列表滚动行为，消息变化时自动滚动到底部
export function useChatScroll(messages: ChatMessage[], isStreaming: boolean): ChatScrollState {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const prevCountRef = useRef(0);
  const shouldFollowRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    shouldFollowRef.current = true;
    setShowScrollButton(false);
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const isNearBottom = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) return true;
    return isScrollNearBottom(element);
  }, []);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const handleScroll = () => {
      const nearBottom = isNearBottom();
      shouldFollowRef.current = nearBottom;
      setShowScrollButton(!nearBottom);
    };
    element.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => element.removeEventListener('scroll', handleScroll);
  }, [isNearBottom]);

  useEffect(() => {
    if (messages.length === 0) return;

    const justLoaded = prevCountRef.current === 0 && messages.length > 0;
    prevCountRef.current = messages.length;

    if (isStreaming && shouldFollowRef.current) {
      scrollToBottom('auto');
    } else if (justLoaded || shouldFollowRef.current) {
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
