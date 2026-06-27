import React from 'react';

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

// Continuous rolling prose — each finalized line joins as inline text. No
// per-line meta, no timestamps; just what was heard.
export function TranscriptFeed({ lines, active }: Props) {
  if (!active && lines.length === 0) return null;

  return (
    <div className="transcript">
      {lines.length === 0 ? (
        <span className="transcript-empty">Listening…</span>
      ) : (
        lines.map((l, i) => (
          <span key={l.id} className={l.interim ? 'interim' : 'transcript-chunk'}>
            {i > 0 ? ' ' : ''}{l.text}
          </span>
        ))
      )}
    </div>
  );
}
