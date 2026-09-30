'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { EmptyState } from '@/components/shared/EmptyState';

import type { MapController, Place, PlaceSuggestion } from '../types';
import styles from '../styles/Panels.module.css';

interface PlaceInputProps {
  controller: MapController | null;
  city: string;
  label: string;
  value: string;
  selected: Place | null;
  onChange: (value: string, place: Place | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

interface SuggestionState {
  query: string;
  city: string;
  items: PlaceSuggestion[];
  message: string;
}

// 把有坐标的搜索建议转为应用地点，缺少坐标时留待正式搜索
function suggestionPlace(suggestion: PlaceSuggestion, city: string): Place | null {
  if (!suggestion.location) return null;
  return {
    id: suggestion.id || `suggestion-${suggestion.location.join(',')}`,
    name: suggestion.name,
    location: suggestion.location,
    address: suggestion.district,
    city,
    district: suggestion.district,
    type: '',
  };
}

// 提供可用键盘操作的地点输入，集中处理去抖与过期建议
export function PlaceInput({
  controller,
  city,
  label,
  value,
  selected,
  onChange,
  placeholder = '输入地点名称',
  disabled = false,
  required = false,
}: PlaceInputProps): React.ReactNode {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<SuggestionState | null>(null);
  const sequence = useRef(0);
  const query = value.trim();
  const canSuggest = focused && query.length > 0 && !selected && !disabled && controller !== null;
  const currentSuggestions = suggestions?.query === query && suggestions.city === city ? suggestions : null;
  const items = currentSuggestions?.items ?? [];
  const expanded = canSuggest && currentSuggestions !== null;
  const active = activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;

  // 与高德建议服务同步输入，并在输入变化或卸载时废弃旧请求
  useEffect(() => {
    if (!canSuggest || !controller) return;
    let cancelled = false;
    const request = ++sequence.current;
    const timer = window.setTimeout(() => {
      controller.suggest(query, city).then(
        (result) => {
          if (cancelled || request !== sequence.current) return;
          setSuggestions({ query, city, items: result.slice(0, 8), message: '' });
        },
        () => {
          if (cancelled || request !== sequence.current) return;
          setSuggestions({ query, city, items: [], message: '地点建议暂时不可用，可直接输入完整名称。' });
        },
      );
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSuggest, controller, query, city]);

  // 提交建议并保留坐标，阻止选项点击造成输入提前失焦
  function choose(suggestion: PlaceSuggestion): void {
    onChange(suggestion.name, suggestionPlace(suggestion, city));
    setFocused(false);
    setActiveIndex(-1);
  }

  // 支持方向键、回车与 Escape 操作自定义地点建议
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setFocused(false);
      return;
    }
    if (!expanded || items.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) =>
        index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length,
      );
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(items[active]);
    }
  }

  return (
    <div className={styles.placeInput}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-suggestions` : undefined}
        aria-activedescendant={expanded && active >= 0 ? `${id}-suggestion-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          onChange(event.target.value, null);
          setFocused(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {expanded ? (
        <div className={styles.suggestionBox}>
          {items.length > 0 ? (
            <ul id={`${id}-suggestions`} className={styles.suggestions} role="listbox" aria-label={`${label}建议`}>
              {items.map((suggestion, index) => (
                <li key={`${suggestion.id}-${index}`} role="presentation">
                  <button
                    id={`${id}-suggestion-${index}`}
                    role="option"
                    aria-selected={active === index}
                    className={active === index ? styles.suggestionActive : styles.suggestion}
                    type="button"
                    tabIndex={-1}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(suggestion)}
                  >
                    <strong>{suggestion.name}</strong>
                    <span>{suggestion.district || '选择此地点'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div id={`${id}-suggestions`} role="listbox" aria-label={`${label}建议`}>
              <EmptyState
                title="暂无地点建议"
                description={currentSuggestions.message || '输入完整名称后可直接查询。'}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
