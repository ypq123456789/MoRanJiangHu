import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.css';
import App from './App';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Root render failed:', error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#050505',
        color: '#f5d08a',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'auto'
      }}>
        <div style={{
          maxWidth: '720px',
          margin: '0 auto',
          border: '1px solid rgba(245, 208, 138, 0.35)',
          borderRadius: '16px',
          background: 'rgba(18, 12, 8, 0.92)',
          padding: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)'
        }}>
          <h1 style={{ margin: '0 0 12px', fontSize: '20px' }}>应用渲染失败</h1>
          <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
            这不是闪退，是前端界面渲染时发生了异常。请把下面这段报错发给我，我会继续修。
          </p>
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#ffe7b8',
            lineHeight: 1.6
          }}>
            {this.state.error.message || '未知错误'}
          </pre>
        </div>
      </div>
    );
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
