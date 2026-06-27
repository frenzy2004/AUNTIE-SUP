import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuntieSettings, BuyerIntent, VerdictResult } from '@shared/types';
import { DEFAULT_BUYER_INTENT } from '@shared/intents';
import { identifyProduct } from './see/identify';
import { runLiveJudge } from './judge/liveJudge';
import { startDesktopAudioCapture, type CaptureHandle } from './listen/capture';
import { createTranscriber, type TranscribeHandle } from './listen/transcribe';
import { extractClaims, hitsAnyKeyword, categoryToRisk } from './listen/extractClaims';
import { ClaimDeduper } from './utils/dedup';
import { RiskFeed } from './components/RiskFeed';
import { TranscriptFeed, type TranscriptLine } from './components/TranscriptFeed';
import { ClaimsBullets, type ClaimBullet } from './components/ClaimsBullets';
import { SettingsDrawer } from './components/SettingsDrawer';
import { IntentSelector } from './components/IntentSelector';
import { TrustNudge } from './components/TrustNudge';

type PendingState = 'idle' | 'identifying' | 'judging' | 'no-match' | 'error';

function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function App() {
  const [settings, setSettings] = useState<AuntieSettings>({});
  const [verdicts, setVerdicts] = useState<VerdictResult[]>([]);
  const [pending, setPending] = useState<PendingState>('idle');
  const [seeError, setSeeError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [listening, setListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [buyerIntent, setBuyerIntent] = useState<BuyerIntent>(DEFAULT_BUYER_INTENT);
  const [dismissedNudgeId, setDismissedNudgeId] = useState<string | null>(null);
  const [demoNudgeActive, setDemoNudgeActive] = useState(false);

  const [collapsed, setCollapsed] = useState(false);
  const [bullets, setBullets] = useState<ClaimBullet[]>([]);

  const captureRef = useRef<CaptureHandle | null>(null);
  const transcriberRef = useRef<TranscribeHandle | null>(null);
  const dedupeRef = useRef(new ClaimDeduper());
  const lastVerdictRef = useRef<VerdictResult | null>(null);

  const collapse = (next: boolean) => {
    setCollapsed(next);
    window.auntie.setCollapsed(next);
  };

  const worstVerdict = verdicts.find(v => v.verdict === 'AVOID')
    ?? verdicts.find(v => v.verdict === 'CAUTION')
    ?? verdicts[0];
  const snipIsLoading = pending === 'identifying' || pending === 'judging';
  const latestActionableClaim = useMemo(
    () => [...bullets].reverse().find(b => b.risk !== 'GREEN') ?? null,
    [bullets]
  );
  const showTrustNudge =
    (listening || demoNudgeActive) &&
    pending === 'idle' &&
    latestActionableClaim !== null &&
    latestActionableClaim.id !== dismissedNudgeId;

  const startProductSnip = useCallback(() => {
    setSeeError(null);
    setDemoNudgeActive(false);
    if (latestActionableClaim) setDismissedNudgeId(latestActionableClaim.id);
    window.auntie.startSnip();
  }, [latestActionableClaim]);

  useEffect(() => {
    window.auntie.getSettings().then(s => {
      setSettings(s);
      if (!s.openaiKey) setShowSettings(true);
    });
  }, []);

  // ─── SEE: handle snip-result from main ─────────────────────────────────
  useEffect(() => {
    const off = window.auntie.onSnipResult(async ({ dataUrl }) => {
      if (!settings.openaiKey) {
        setShowSettings(true);
        return;
      }
      if (!settings.exaKey) {
        alert('Exa API key required for live evidence gathering. Add it in Settings.');
        setShowSettings(true);
        return;
      }
      setSeeError(null);
      setPending('identifying');
      try {
        const identity = await identifyProduct(dataUrl, settings.openaiKey);
        if (!identity) { setPending('no-match'); return; }

        setPending('judging');
        const result = await runLiveJudge({
          product: identity,
          sellerHandle: undefined, // visible seller name not consistently present in screenshot
          intent: buyerIntent,
          openaiKey: settings.openaiKey,
          exaKey: settings.exaKey
        });
        lastVerdictRef.current = result;
        setVerdicts(v => [result, ...v]);
        setPending('idle');
      } catch (err) {
        console.error('[SEE] failed', err);
        setSeeError(err instanceof Error ? err.message : 'Could not analyze this snip.');
        setPending('error');
      }
    });
    return () => { off(); };
  }, [buyerIntent, settings.openaiKey, settings.exaKey]);

  // ─── LISTEN: hotkey from main toggles listening ────────────────────────
  const toggleListen = useCallback(async () => {
    if (listening) {
      captureRef.current?.stop();
      transcriberRef.current?.stop();
      captureRef.current = null;
      transcriberRef.current = null;
      setListening(false);
      return;
    }
    if (!settings.openaiKey) { setShowSettings(true); return; }
    try {
      const transcriber = createTranscriber(settings.openaiKey, {
        onText: async text => {
          // Keep only the last 3 chunks; transcript is a live strip, not a log.
          // The CLAIMS bullets and verdicts are the lasting record.
          setTranscript(t => [...t.slice(-2), { id: newId(), text, at: Date.now() }]);
          if (dedupeRef.current.isDuplicate(text)) return;
          dedupeRef.current.add(text);

          // Stage 1: synchronous lexical pre-filter → instant pending bullets.
          // The whole point: user sees AUNTIE react in ~50ms via the keyword
          // pre-filter, even though the GPT extraction call takes 3-5s.
          const hits = hitsAnyKeyword(text);
          if (hits.length === 0) return; // pure puffery
          const utteranceId = newId();
          const pending: ClaimBullet[] = hits.map((cat, i) => ({
            id: `${utteranceId}-${i}`,
            utterance: text,
            category: cat,
            risk: categoryToRisk(cat),
            status: 'pending'
          }));
          setBullets(b => [...b.slice(-10 + pending.length), ...pending]);

          // Stage 2: GPT extraction → mark bullets resolved + add to verdict signals.
          const claims = await extractClaims(text, settings.openaiKey!);
          setBullets(b =>
            b.map(bullet =>
              bullet.id.startsWith(utteranceId)
                ? { ...bullet, status: 'resolved' as const }
                : bullet
            )
          );
          for (const c of claims) addClaimSignal(c.text, c.category);
        }
      });
      transcriberRef.current = transcriber;
      const cap = await startDesktopAudioCapture({
        onChunk: pcm => transcriber.push(pcm),
        onError: err => console.warn('[listen] capture error', err)
      });
      captureRef.current = cap;
      setListening(true);
    } catch (err) {
      console.error('[LISTEN] failed', err);
      alert('Could not start listening: ' + (err as Error).message);
    }
  }, [listening, settings.openaiKey]);

  useEffect(() => {
    const off = window.auntie.onToggleListen(() => { void toggleListen(); });
    return () => { off(); };
  }, [toggleListen]);

  // ─── Demo trigger (Alt+Shift+D): live judge on a hardcoded test product ──
  // Real Exa + GPT calls — no cached/planted data.
  const runDemo = useCallback(async () => {
    const demoText = 'Today only, 100% original Dyson, FDA approved technology, cheapest in Singapore.';
    const hits = hitsAnyKeyword(demoText);
    const utteranceId = `demo-${newId()}`;
    const pending: ClaimBullet[] = hits.map((cat, i) => ({
      id: `${utteranceId}-${i}`,
      utterance: demoText,
      category: cat,
      risk: categoryToRisk(cat),
      status: 'pending'
    }));
    setBullets(b => [...b.slice(-10 + pending.length), ...pending]);
    setDismissedNudgeId(null);
    setDemoNudgeActive(true);

    if (!settings.openaiKey || !settings.exaKey) {
      setShowSettings(true);
      return;
    }
    await new Promise(r => setTimeout(r, 650));
    setBullets(b =>
      b.map(bullet =>
        bullet.id.startsWith(utteranceId)
          ? { ...bullet, status: 'resolved' as const }
          : bullet
      )
    );
    setPending('judging');
    try {
      const result = await runLiveJudge({
        product: {
          name: 'Dyson Airwrap Complete Long',
          brand: 'Dyson',
          category: 'Hair Styling',
          visiblePrice: 'S$299',
          visibleClaims: ['100% Original Dyson', 'Cheapest in Singapore today only', 'FDA approved technology']
        },
        sellerHandle: 'BeautyDeals_SG',
        intent: buyerIntent,
        openaiKey: settings.openaiKey,
        exaKey: settings.exaKey
      });
      lastVerdictRef.current = result;
      setVerdicts(v => [result, ...v]);
    } catch (err) {
      console.error('[demo] live judge failed', err);
    } finally {
      setDemoNudgeActive(false);
      setPending('idle');
    }
  }, [buyerIntent, settings.openaiKey, settings.exaKey]);

  useEffect(() => {
    const off = window.auntie.onDemoTrigger(() => { void runDemo(); });
    return () => { off(); };
  }, [runDemo]);

  // ─── A spoken claim attaches a new signal row to the most recent verdict ──
  // Re-renders just that verdict with one extra spoken-claim signal at the top.
  const addClaimSignal = (claimText: string, category: string) => {
    const recent = lastVerdictRef.current;
    if (!recent) return;
    const updated: VerdictResult = {
      ...recent,
      generatedAt: Date.now(),
      signals: [
        {
          key: 'claims',
          label: `Spoken claim — ${category}`,
          risk: 'RED',
          confidence: 0.85,
          finding: `"${claimText}"`,
          receipts: [`Category: ${category} · source: live transcript`]
        },
        ...recent.signals.filter(s => s.key !== 'claims' || !s.label.startsWith('Spoken claim'))
      ]
    };
    lastVerdictRef.current = updated;
    setVerdicts(v => [updated, ...v.filter(r => r.generatedAt !== recent.generatedAt)]);
  };

  // ─── Render ───────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        className={`pill ${worstVerdict?.verdict ?? ''} ${listening ? 'listening' : ''}`}
        onClick={() => collapse(false)}
        title="Click to expand · AUNTIE"
      >
        <span className="pill-dot" />
        {verdicts.length > 0 && (
          <span className="pill-count">{verdicts.length}</span>
        )}
        {listening && <span className="pill-listen-dot" />}
      </div>
    );
  }

  return (
    <div className="panel">
      <header className="header">
        <div className="brand">
          <span className={`brand-dot ${listening ? 'live' : ''}`} />
          <span className="brand-name">AUNTIE</span>
          <span className="brand-sub">{listening ? 'listening' : 'trust co-pilot'}</span>
        </div>
        <div className="controls">
          {verdicts.length > 0 && (
            <button
              className="header-export"
              title="Copy latest verdict as JSON"
              onClick={() => {
                const latest = verdicts[0];
                if (!latest) return;
                navigator.clipboard.writeText(JSON.stringify(latest, null, 2));
              }}
            >
              Export
            </button>
          )}
          <button
            className="icon-btn"
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
          <button
            className="icon-btn"
            title="Collapse to pill"
            onClick={() => collapse(true)}
          >
            ›
          </button>
        </div>
      </header>

      <div className="actions">
        <button className="action-btn primary" onClick={startProductSnip}>
          ✂ Snip product <span className="kbd">⌥⇧S</span>
        </button>
        <button className={`action-btn ${listening ? 'primary' : ''}`} onClick={toggleListen}>
          {listening ? '■ Stop listening' : '◎ Listen'} <span className="kbd">⌥⇧L</span>
        </button>
      </div>

      <IntentSelector value={buyerIntent} onChange={setBuyerIntent} />

      {listening && (
        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <TranscriptFeed lines={transcript} active={listening} />
          <ClaimsBullets bullets={bullets} />
        </div>
      )}

      <div className="body">
        {showTrustNudge && latestActionableClaim && (
          <TrustNudge
            claim={latestActionableClaim}
            intent={buyerIntent}
            onVerify={startProductSnip}
            onDismiss={() => setDismissedNudgeId(latestActionableClaim.id)}
          />
        )}

        {snipIsLoading && (
          <div className="card">
            <div className="shimmer" style={{ height: 16, width: '60%' }} />
            <div className="shimmer" style={{ height: 12, width: '85%' }} />
            <div className="shimmer" style={{ height: 12, width: '70%' }} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {pending === 'identifying' ? 'Reading product and visible claims...' : 'Checking seller, price, and claims...'}
            </div>
          </div>
        )}

        {pending === 'no-match' && (
          <div className="card see-status">
            <div className="see-status-title">No product found</div>
            <div className="see-status-copy">
              Try a tighter snip around the product, label, or price tag.
            </div>
          </div>
        )}

        {pending === 'error' && (
          <div className="card see-status error">
            <div className="see-status-title">Snip analysis failed</div>
            <div className="see-status-copy">{seeError}</div>
          </div>
        )}

        {verdicts.length === 0 && pending === 'idle' && (
          <div className="empty">
            <div className="empty-icon">✂</div>
            <div>Snip a product on the livestream to get the verdict.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>Or hit <kbd>Alt+Shift+L</kbd> to listen for risky claims.</div>
          </div>
        )}

        {verdicts.map((r, i) => <RiskFeed key={r.generatedAt + '-' + i} result={r} index={i} />)}
      </div>

      <SettingsDrawer
        open={showSettings}
        onClose={() => {
          setShowSettings(false);
          window.auntie.getSettings().then(setSettings);
        }}
      />
    </div>
  );
}
