// Desktop audio capture in the renderer. The main process resolves the
// screen source id; we feed it to getUserMedia and downsample to 16k mono PCM.

export interface CaptureHandle {
  stop: () => void;
}

export interface CaptureOpts {
  onChunk: (pcm: Int16Array) => void;
  onError?: (err: Error) => void;
}

export async function startDesktopAudioCapture(opts: CaptureOpts): Promise<CaptureHandle> {
  const src = await window.auntie.getAudioSource();
  if (!src) throw new Error('No screen source available for audio capture.');

  // On Electron we use the legacy chromeMediaSource constraint to grab desktop audio.
  // Video is requested but immediately discarded — Chromium requires both on Windows.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // @ts-expect-error chromeMediaSource is an Electron/Chromium-specific constraint
      mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id }
    },
    video: {
      // @ts-expect-error
      mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id, maxWidth: 1, maxHeight: 1 }
    }
  });
  // Discard video tracks.
  stream.getVideoTracks().forEach(t => t.stop());

  const ctx = new AudioContext({ sampleRate: 48000 });
  const source = ctx.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated but ubiquitous and avoids the AudioWorklet
  // load step — fine for hackathon scope.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(ctx.destination);

  const RATIO = 48000 / 16000;

  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const f32 = e.inputBuffer.getChannelData(0);
    const outLen = Math.floor(f32.length / RATIO);
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const s = Math.max(-1, Math.min(1, f32[Math.floor(i * RATIO)]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    try { opts.onChunk(out); } catch (err) { opts.onError?.(err as Error); }
  };

  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach(t => t.stop());
      ctx.close();
    }
  };
}
