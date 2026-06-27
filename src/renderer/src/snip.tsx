import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './snip.css';

interface Point { x: number; y: number }

function SnipUI() {
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    window.auntie.getSnipBackground().then(setBgUrl);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.auntie.snipCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };
  const onMouseUp = () => {
    draggingRef.current = false;
    if (!start || !end) {
      window.auntie.snipCancel();
      return;
    }
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 8 || height < 8) {
      window.auntie.snipCancel();
      return;
    }
    window.auntie.snipComplete({ x, y, width, height });
  };

  const rect = start && end
    ? {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y)
      }
    : null;

  return (
    <div
      className="snip-root"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {bgUrl && <img src={bgUrl} className="snip-bg" alt="" draggable={false} />}
      <div className="snip-hint">
        Drag to snip the product · <kbd>Esc</kbd> to cancel
      </div>
      {rect && (
        <div
          className="snip-rect"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        >
          <div className="snip-rect-size">{rect.width} × {rect.height}</div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<SnipUI />);
