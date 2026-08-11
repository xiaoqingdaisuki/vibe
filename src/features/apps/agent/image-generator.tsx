'use client';

import Image from 'next/image';
import { useId, useState } from 'react';

import { generateAgentImage } from './image-api';
import styles from './styles/Agent.module.css';

// 图像生成面板图标
function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </svg>
  );
}

// 可折叠的图像生成面板，调用API生成图片
export function ImageGenerator() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const promptId = useId();

  const submit = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    try {
      const image = await generateAgentImage(trimmedPrompt);
      setImageDataUrl(image.imageDataUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '图像生成失败，请稍后重试。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className={styles.imageGenerator} aria-label="图像生成">
      <button
        type="button"
        className={styles.imageGeneratorToggle}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <span className={styles.imageGeneratorIcon}>
          <ImageIcon />
        </span>
        <span className={styles.imageGeneratorTitle}>文本生成图像</span>
      </button>

      {isOpen ? (
        <div className={styles.imageGeneratorBody}>
          <label htmlFor={promptId} className={styles.imagePromptLabel}>
            文本描述想要生成的图片内容
          </label>
          <textarea
            id={promptId}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className={styles.imagePrompt}
            placeholder="例如：雨后的上海街头，电影感，霓虹灯倒映在地面"
            rows={3}
            maxLength={2000}
            disabled={isGenerating}
          />
          <div className={styles.imageGeneratorActions}>
            <span className={styles.imagePromptCount}>{prompt.length}/2000</span>
            <button
              type="button"
              className={styles.imageGenerateButton}
              onClick={() => void submit()}
              disabled={!prompt.trim() || isGenerating}
            >
              {isGenerating ? '正在生成…' : '生成图片'}
            </button>
          </div>

          {error ? <div className={styles.imageError}>{error}</div> : null}
          {imageDataUrl ? (
            <div className={styles.imageResult}>
              <Image
                src={imageDataUrl}
                alt={prompt || 'AI 生成图片'}
                width={1024}
                height={1024}
                unoptimized
                className={styles.generatedImage}
              />
              <a href={imageDataUrl} download="stepfun-generated-image.png" className={styles.imageDownload}>
                下载图片
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
