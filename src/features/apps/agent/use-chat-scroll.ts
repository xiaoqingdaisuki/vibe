import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from './use-agent-chat';

interface ChatScrollState {
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useChatScroll(messages: ChatMessage[], isStreaming: boolean, ready: boolean): ChatScrollState {
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
    } else if (ready && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      // 双重 rAF：确保 React 完成 DOM 提交且浏览器完成 layout 后再滚动
      // 单层 rAF 不够，因为 React 18 的 commit 可能跨帧，此时 scrollHeight 还不完整
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom('smooth');
        });
      });
    }
  }, [messages, isStreaming, isNearBottom, scrollToBottom, ready]);

  return {
    messagesEndRef,
    scrollContainerRef,
    showScrollButton,
    scrollToBottom,
  };
}
