// Voice-activity-segmented STT. Instead of slicing audio into fixed 2s blocks
// (which chops words mid-syllable and makes the model hallucinate on silence),
// we accumulate speech and cut a segment at a natural pause. Each segment is a
// whole utterance, so word boundaries stay intact and accuracy jumps.
//
// - Onset preroll: we keep a short rolling buffer of pre-speech audio and
//   prepend it when speech starts, so the first word isn't clipped.
// - Pause endpointing: a segment flushes after SILENCE_HANG of quiet (once it's
//   at least MIN_SEGMENT long), or at MAX_SEGMENT to bound latency.
// - Drift guard: segments queue and transcribe in order; if we fall far behind
//   (slow network), the oldest queued segment is dropped so captions stay live.

import OpenAI from 'openai';
import { MODELS } from '@shared/config';

const SAMPLE_RATE = 16000;
const MS = SAMPLE_RATE / 1000;

// Energy gate. Matches the "audio detected" threshold used by the capture meter.
const SILENCE_RMS = 0.012;
// Quiet stretch that ends an utterance.
const SILENCE_HANG_SAMPLES = Math.floor(550 * MS);
// Don't bother sending blips shorter than this (excludes coughs/clicks).
const MIN_SEGMENT_SAMPLES = Math.floor(600 * MS);
// Hard cap so a non-stop talker still gets captions promptly.
const MAX_SEGMENT_SAMPLES = Math.floor(9000 * MS);
// Audio kept before speech onset so the first word isn't clipped.
const PREROLL_SAMPLES = Math.floor(220 * MS);
// Trailing silence to leave on a pause-ended segment (the rest is trimmed to
// avoid silence hallucinations).
const KEEP_TAIL_SAMPLES = Math.floor(160 * MS);
// On a forced (mid-speech) cut, carry this tail into the next segment.
const CARRY_TAIL_SAMPLES = Math.floor(220 * MS);
// Max segments waiting to transcribe before we start dropping the oldest.
const MAX_QUEUE = 3;

// Domain hint biases the model toward live-commerce vocabulary and the SEA
// language mix, which measurably cuts misrecognitions and silence hallucinations.
const TRANSCRIBE_PROMPT =
  'Live shopping stream. Speech mixes English, Malay, and Singlish. ' +
  'Expect product names, brands, prices (RM, S$), and sales claims.';

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

function rms(pcm: Int16Array): number {
  let energy = 0;
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i] / 32768;
    energy += s * s;
  }
  return Math.sqrt(energy / Math.max(1, pcm.length));
}

function concat(pieces: Int16Array[], length: number): Int16Array {
  const out = new Int16Array(length);
  let off = 0;
  for (const p of pieces) { out.set(p, off); off += p.length; }
  return out;
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
  let stopped = false;

  // Current utterance being built.
  let pieces: Int16Array[] = [];
  let segLen = 0;
  let inSpeech = false;
  let silenceRun = 0;

  // Rolling pre-speech buffer for onset preroll.
  let preroll: Int16Array[] = [];
  let prerollLen = 0;

  // Transcription queue + single sequential worker (preserves caption order).
  const queue: Int16Array[] = [];
  let working = false;

  const pushPreroll = (pcm: Int16Array) => {
    preroll.push(pcm);
    prerollLen += pcm.length;
    while (preroll.length > 1 && prerollLen - preroll[0].length >= PREROLL_SAMPLES) {
      prerollLen -= preroll[0].length;
      preroll.shift();
    }
  };

  const resetSegment = () => {
    pieces = [];
    segLen = 0;
    inSpeech = false;
    silenceRun = 0;
  };

  const enqueue = (audio: Int16Array) => {
    if (audio.length < MIN_SEGMENT_SAMPLES) return;
    queue.push(audio);
    while (queue.length > MAX_QUEUE) {
      queue.shift();
      console.warn('[transcribe] dropping oldest segment to stay live');
    }
    void drain();
  };

  const drain = async () => {
    if (working) return;
    working = true;
    try {
      while (!stopped && queue.length > 0) {
        const audio = queue.shift()!;
        const wav = int16ToWav(audio, SAMPLE_RATE);
        try {
          const file = new File([wav], 'segment.wav', { type: 'audio/wav' });
          const res = await client.audio.transcriptions.create({
            file,
            model: MODELS.transcribe,
            response_format: 'text',
            prompt: TRANSCRIBE_PROMPT
          });
          const text = typeof res === 'string' ? res : (res as { text?: string }).text ?? '';
          const clean = text.trim();
          if (clean && !stopped) opts.onText(clean);
        } catch (err) {
          opts.onError?.(err as Error);
        }
      }
    } finally {
      working = false;
    }
  };

  const flush = (forced: boolean) => {
    if (segLen === 0) { resetSegment(); return; }
    const full = concat(pieces, segLen);
    let carry: Int16Array | null = null;
    let send: Int16Array;
    if (forced) {
      // Mid-speech cut: keep a tail to seed the next segment so the word at the
      // boundary isn't lost.
      send = full;
      carry = full.subarray(Math.max(0, full.length - CARRY_TAIL_SAMPLES)).slice();
    } else {
      // Pause-ended: trim most of the trailing silence to avoid hallucinations.
      const keep = full.length - Math.max(0, silenceRun - KEEP_TAIL_SAMPLES);
      send = full.subarray(0, Math.max(MIN_SEGMENT_SAMPLES, keep));
    }
    enqueue(send.slice());
    resetSegment();
    if (carry) { preroll = [carry]; prerollLen = carry.length; }
    else { preroll = []; prerollLen = 0; }
  };

  return {
    push: (pcm: Int16Array) => {
      if (stopped || pcm.length === 0) return;
      const speech = rms(pcm) >= SILENCE_RMS;

      if (!inSpeech) {
        if (speech) {
          // Start a segment, prepending the recent pre-speech audio.
          inSpeech = true;
          silenceRun = 0;
          pieces = preroll.slice();
          segLen = prerollLen;
          preroll = [];
          prerollLen = 0;
          pieces.push(pcm);
          segLen += pcm.length;
        } else {
          pushPreroll(pcm);
        }
        return;
      }

      pieces.push(pcm);
      segLen += pcm.length;
      silenceRun = speech ? 0 : silenceRun + pcm.length;

      if (silenceRun >= SILENCE_HANG_SAMPLES && segLen - silenceRun >= MIN_SEGMENT_SAMPLES) {
        flush(false);
      } else if (segLen >= MAX_SEGMENT_SAMPLES) {
        flush(true);
      }
    },
    stop: () => {
      stopped = true;
      resetSegment();
      preroll = [];
      prerollLen = 0;
      queue.length = 0;
    }
  };
}
