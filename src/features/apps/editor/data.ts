import type { EditorDocument, OnlineEditorWorkspace } from './types';

export const DEFAULT_EDITOR_CODE = `const { useEffect, useState } = React;
const { createRoot } = ReactDOM;

const styleText = \`
  * {
    box-sizing: border-box;
  }

  body {
    min-height: 100vh;
    margin: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #f7f5ff;
    color: #251b3d;
    font-family: Inter, system-ui, sans-serif;
  }

  .hello-card {
    width: min(88vw, 480px);
    padding: 32px;
    border: 1px solid #e4def8;
    border-radius: 28px;
    background: #ffffff;
    box-shadow: 0 20px 56px rgba(86, 63, 137, 0.14);
    text-align: center;
  }

  .hello-sky {
    position: relative;
    height: 184px;
    overflow: hidden;
    border-radius: 20px;
    background: linear-gradient(145deg, #efe9ff, #dcf4ff);
  }

  .hello-cloud,
  .hello-sun {
    position: absolute;
    border-radius: 999px;
  }

  .hello-cloud {
    width: 86px;
    height: 28px;
    background: rgba(255, 255, 255, 0.88);
    animation: drift 7s ease-in-out infinite alternate;
  }

  .hello-cloud::before,
  .hello-cloud::after {
    position: absolute;
    bottom: 0;
    content: '';
    border-radius: inherit;
    background: inherit;
  }

  .hello-cloud::before {
    width: 38px;
    height: 38px;
    left: 14px;
  }

  .hello-cloud::after {
    width: 30px;
    height: 30px;
    right: 12px;
  }

  .cloud-one {
    top: 38px;
    left: 28px;
  }

  .cloud-two {
    right: 20px;
    bottom: 34px;
    animation-delay: -3s;
  }

  .hello-sun {
    top: 44px;
    left: calc(50% - 40px);
    display: grid;
    width: 80px;
    height: 80px;
    place-items: center;
    background: #ffcf5c;
    box-shadow: 0 0 0 12px rgba(255, 207, 92, 0.22);
    animation: hello 2.8s ease-in-out infinite;
    font-size: 34px;
  }

  .hello-sun.is-waving {
    animation-duration: 1.1s;
  }

  .hello-card h1 {
    margin: 24px 0 8px;
    font-size: 28px;
    letter-spacing: -0.04em;
  }

  .hello-card p {
    margin: 0;
    color: #665c7e;
    line-height: 1.7;
  }

  .hello-card button {
    min-height: 44px;
    margin-top: 24px;
    border: 0;
    border-radius: 12px;
    padding: 0 20px;
    background: #7c3aed;
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  @keyframes hello {
    0%, 100% { transform: translateY(0) rotate(-4deg); }
    50% { transform: translateY(-10px) rotate(4deg); }
  }

  @keyframes drift {
    from { transform: translateX(-8px); }
    to { transform: translateX(12px); }
  }
\`;

// 将示例样式注入当前沙箱文档，卸载时同步清理
function usePreviewStyle() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = styleText;
    document.head.append(style);
    return () => style.remove();
  }, []);
}

// 渲染可点击互动的友善欢迎动画
function WelcomeAnimation() {
  const [isWaving, setIsWaving] = useState(false);
  usePreviewStyle();

  return (
    <main className="hello-card">
      <div className="hello-sky" aria-hidden="true">
        <span className="hello-cloud cloud-one"></span>
        <span className="hello-cloud cloud-two"></span>
        <span className={\`hello-sun\${isWaving ? ' is-waving' : ''}\`}>☀</span>
      </div>
      <h1>{isWaving ? '很高兴见到你！' : '你好，创作者。'}</h1>
      <p>这是一个 React 实时预览。试着修改这段代码，或点击按钮让太阳打个招呼。</p>
      <button type="button" onClick={() => setIsWaving((current) => !current)}>
        {isWaving ? '收下这份问候' : '向太阳挥手'}
      </button>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<WelcomeAnimation />);`;

export const DEFAULT_EDITOR: EditorDocument = {
  code: DEFAULT_EDITOR_CODE,
  id: 'editor-1',
  title: '编辑器 1',
};

export const DEFAULT_WORKSPACE: OnlineEditorWorkspace = {
  activeEditorId: DEFAULT_EDITOR.id,
  editors: [DEFAULT_EDITOR],
  version: 2,
};

// 创建默认 React 编辑器副本，避免不同工作区共享源码引用
export function createDefaultEditor(options: Pick<EditorDocument, 'id' | 'title'>): EditorDocument {
  return { ...options, code: DEFAULT_EDITOR_CODE };
}

// 创建默认工作区副本，避免编辑状态污染内置示例
export function createDefaultWorkspace(): OnlineEditorWorkspace {
  return {
    activeEditorId: DEFAULT_WORKSPACE.activeEditorId,
    editors: DEFAULT_WORKSPACE.editors.map((editor) => ({ ...editor })),
    version: DEFAULT_WORKSPACE.version,
  };
}
