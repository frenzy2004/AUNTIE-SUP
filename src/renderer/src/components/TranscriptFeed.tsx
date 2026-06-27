import React, { useEffect, useRef, useState } from 'react';

export interface TranscriptLine {
  id: string;
  text: string;
  at: number;
  interim?: boolean;
  speaker?: string;
}

interface Props {
  lines: TranscriptLine[];
  active: boolean;
}

function formatCaptionTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function TranscriptFeed({ lines, active }: Props) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list || collapsed) return;
    list.scrollTop = list.scrollHeight;
  }, [lines, collapsed]);

  if (!active && lines.length === 0) return null;

  const visibleLines = lines.slice(-10);

  return (
    <section className={`transcript ${active ? 'active' : 'stopped'} ${collapsed ? 'collapsed' : ''}`} aria-live="polite">
      <div className="transcript-head">
        <div className="transcript-title">
          <span className="transcript-live-dot" />
          <span>Live captions</span>
        </div>
        <div className="transcript-head-right">
          <span className="transcript-state">{active ? 'Listening' : 'Stopped'}</span>
          <button
            type="button"
            className="transcript-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand live captions' : 'Collapse live captions'}
            title={collapsed ? 'Expand live captions' : 'Collapse live captions'}
            onClick={() => setCollapsed(c => !c)}
          >
            <svg
              className="transcript-toggle-chevron"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        visibleLines.length === 0 ? (
          <div className="transcript-empty">
            <span className="transcript-empty-dot" />
            <span>Waiting for speech...</span>
          </div>
        ) : (
          <ol className="transcript-list" ref={listRef}>
            {visibleLines.map((line, index) => {
              const isLatest = index === visibleLines.length - 1;
              return (
                <li
                  key={line.id}
                  className={`transcript-line ${line.interim ? 'interim' : ''} ${isLatest ? 'latest' : ''}`}
                >
                  <time className="transcript-time" dateTime={new Date(line.at).toISOString()}>
                    {formatCaptionTime(line.at)}
                  </time>
                  {line.speaker && <span className="transcript-speaker">{line.speaker}</span>}
                  <span className="transcript-text">{line.text}</span>
                </li>
              );
            })}
          </ol>
        )
      )}
    </section>
  );
}
