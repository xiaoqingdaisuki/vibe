import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from './use-agent-chat';

interface ChatScrollState {
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useChatScroll(messages: ChatMessage[], isStreaming: boolean, hasStreamingComplete: boolean): ChatScrollState {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const hasScrolledRef = useRef(false);

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

    if (isStreaming) {
      scrollToBottom('auto');
    } else if (isNearBottom()) {
      scrollToBottom('smooth');
    } else if (hasStreamingComplete && !hasScrolledRef.current) {
      // 有消息刚结束 streaming — 等打字机动画开始后再滚动
      hasScrolledRef.current = true;
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom('smooth');
        });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [messages, isStreaming, isNearBottom, scrollToBottom, hasStreamingComplete]);

  return {
    messagesEndRef,
    scrollContainerRef,
    showScrollButton,
    scrollToBottom,
  };
}
