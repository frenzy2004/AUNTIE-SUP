// Rolling-buffer STT. We accumulate ~8s of PCM, encode to WAV in-memory, and
// POST to OpenAI transcribe. This is a hackathon-safe path that avoids the
// Realtime WebSocket auth dance. Latency is 2-4s per chunk — good enough for a
// live-claims demo.

import OpenAI from 'openai';
import { MODELS } from '@shared/config';

const SAMPLE_RATE = 16000;
// 4s chunks: trade off latency vs API cost. ~2-3s round-trip after each
// chunk completes → user sees text within ~5-6s of speech vs 8-10s at 6s.
const CHUNK_SECONDS = 4;
const TARGET_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS;

function int16ToWav(pcm: Int16Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let off = 0;
  const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i)); };
  writeStr('RIFF');
  view.setUint32(off, 36 + dataSize, true); off += 4;
  writeStr('WAVE');
  writeStr('fmt ');
  view.setUint32(off, 16, true); off += 4;     // fmt chunk size
  view.setUint16(off, 1, true); off += 2;      // PCM
  view.setUint16(off, 1, true); off += 2;      // mono
  view.setUint32(off, sampleRate, true); off += 4;
  view.setUint32(off, byteRate, true); off += 4;
  view.setUint16(off, blockAlign, true); off += 2;
  view.setUint16(off, 16, true); off += 2;
  writeStr('data');
  view.setUint32(off, dataSize, true); off += 4;
  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(off, pcm[i], true);
    off += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export interface TranscribeHandle {
  push: (pcm: Int16Array) => void;
  stop: () => void;
}

export interface TranscribeOpts {
  onText: (text: string) => void;
  onError?: (err: Error) => void;
}

export function createTranscriber(openaiKey: string, opts: TranscribeOpts): TranscribeHandle {
  const client = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
  let buffer: Int16Array = new Int16Array(0);
  let stopped = false;
  let pending: Promise<void> | null = null;

  const flush = async () => {
    if (stopped || buffer.length < TARGET_SAMPLES) return;
    const slice = buffer.slice(0, TARGET_SAMPLES);
    buffer = buffer.slice(TARGET_SAMPLES);
    const wav = int16ToWav(slice, SAMPLE_RATE);
    try {
      const file = new File([wav], 'chunk.wav', { type: 'audio/wav' });
      const res = await client.audio.transcriptions.create({
        file,
        model: MODELS.transcribe,
        response_format: 'text'
      });
      const text = typeof res === 'string' ? res : (res as { text?: string }).text ?? '';
      if (text.trim()) opts.onText(text.trim());
    } catch (err) {
      opts.onError?.(err as Error);
    }
  };

  return {
    push: (pcm: Int16Array) => {
      if (stopped) return;
      const merged = new Int16Array(buffer.length + pcm.length);
      merged.set(buffer, 0);
      merged.set(pcm, buffer.length);
      buffer = merged;
      // chain to avoid concurrent flushes overlapping wildly
      if (buffer.length >= TARGET_SAMPLES && !pending) {
        pending = flush().finally(() => { pending = null; });
      }
    },
    stop: () => { stopped = true; buffer = new Int16Array(0); }
  };
}
