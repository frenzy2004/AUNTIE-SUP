import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuntieSettings, BuyerIntent, TriggerClaim, VerdictResult } from '@shared/types';
import { DEFAULT_BUYER_INTENT } from '@shared/intents';
import { identifyProduct } from './see/identify';
import { lookupProduct, allCachedProducts } from './see/cacheLookup';
import { runLiveJudge } from './judge/liveJudge';
import { judgeFromBlob } from '@judge/judgeFromBlob';
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
import { Mascot, type MascotMood } from './components/Mascot';
import { auntie } from './bridge';

type PendingState = 'idle' | 'identifying' | 'judging' | 'no-match' | 'no-cache' | 'error';
const MAX_TRANSCRIPT_LINES = 24;

function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function statusCopy(
  pending: PendingState,
  listening: boolean,
  hasVerdict: boolean,
  hasNudge: boolean
) {
  if (pending === 'identifying') return { title: 'Reading product', copy: 'Matching the snip to product evidence.' };
  if (pending === 'judging') return { title: 'Checking trust', copy: 'Seller, claims, price and proof are being weighed.' };
  if (hasNudge) return { title: 'Claim spotted', copy: 'Verify it before paying.' };
  if (listening) return { title: 'Listening', copy: 'Risky seller claims will surface here.' };
  if (hasVerdict) return { title: 'Decision ready', copy: 'Use the next action, or open read-more for proof.' };
  return { title: 'Ready', copy: 'Snip the product, or listen while you watch.' };
}

export function App() {
  const [settings, setSettings] = useState<AuntieSettings>({});
  const [verdicts, setVerdicts] = useState<VerdictResult[]>([]);
  const [pending, setPending] = useState<PendingState>('idle');
  const [seeError, setSeeError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [listening, setListening] = useState(false);
  const [listenStatus, setListenStatus] = useState('Idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [buyerIntent, setBuyerIntent] = useState<BuyerIntent>(DEFAULT_BUYER_INTENT);
  const [dismissedNudgeId, setDismissedNudgeId] = useState<string | null>(null);
  const [demoNudgeActive, setDemoNudgeActive] = useState(false);
  const [pendingTriggerClaim, setPendingTriggerClaim] = useState<TriggerClaim | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  const [bullets, setBullets] = useState<ClaimBullet[]>([]);
  const [exported, setExported] = useState(false);

  const captureRef = useRef<CaptureHandle | null>(null);
  const transcriberRef = useRef<TranscribeHandle | null>(null);
  const dedupeRef = useRef(new ClaimDeduper());
  const lastVerdictRef = useRef<VerdictResult | null>(null);
  const lastLevelUpdateRef = useRef(0);
  const listenErrorRef = useRef(false);

  const collapse = (next: boolean) => {
    setCollapsed(next);
    auntie.setCollapsed(next);
  };

  const worstVerdict = verdicts.find(v => v.verdict === 'AVOID')
    ?? verdicts.find(v => v.verdict === 'CAUTION')
    ?? verdicts[0];
  const mascotMood: MascotMood =
    worstVerdict?.verdict === 'AVOID' ? 'alert'
      : worstVerdict?.verdict === 'TRUST' ? 'happy'
      : 'idle';
  const snipIsLoading = pending === 'identifying' || pending === 'judging';
  const latestActionableClaim = useMemo(() => {
    const priority: Record<BuyerIntent, Array<TriggerClaim['category']>> = {
      authenticity: ['authenticity', 'certification', 'offplatform', 'price', 'scarcity', 'medical'],
      best_price: ['price', 'scarcity', 'offplatform', 'authenticity', 'certification', 'medical'],
      health_safety: ['medical', 'certification', 'authenticity', 'offplatform', 'price', 'scarcity'],
      warranty: ['certification', 'authenticity', 'offplatform', 'price', 'scarcity', 'medical'],
      seller_trust: ['offplatform', 'scarcity', 'authenticity', 'certification', 'price', 'medical']
    };
    const actionable = [...bullets].reverse().filter(b => b.risk !== 'GREEN');
    for (const category of priority[buyerIntent]) {
      const hit = actionable.find(b => b.category === category);
      if (hit) return hit;
    }
    return actionable[0] ?? null;
  }, [bullets, buyerIntent]);
  const showTrustNudge =
    (listening || demoNudgeActive) &&
    pending === 'idle' &&
    latestActionableClaim !== null &&
    latestActionableClaim.id !== dismissedNudgeId;
  const guide = statusCopy(pending, listening || demoNudgeActive, verdicts.length > 0, showTrustNudge);

  const claimToTrigger = (claim: typeof latestActionableClaim): TriggerClaim | null =>
    claim
      ? { text: claim.utterance, category: claim.category, risk: claim.risk }
      : null;

  const startProductSnip = useCallback((claim = latestActionableClaim) => {
    setSeeError(null);
    setDemoNudgeActive(false);
    setPendingTriggerClaim(claimToTrigger(claim));
    if (claim) setDismissedNudgeId(claim.id);
    auntie.startSnip();
  }, [latestActionableClaim]);

  useEffect(() => {
    auntie.getSettings().then(s => {
      setSettings(s);
      if (!s.openaiKey) setShowSettings(true);
    });
  }, []);

  useEffect(() => {
    const off = auntie.onSnipError(message => {
      setSeeError(message);
      setPending('error');
    });
    return () => { off(); };
  }, []);

  // ─── SEE: handle snip-result from main ─────────────────────────────────
  // Cache-first: if we have an offline-scraped blob for the identified product,
  // judge from it instantly (all six signals, real buyer voices — no Exa/GPT
  // needed beyond vision). Only fall back to the live Exa path when there's no
  // cache hit AND an Exa key is set. No key + no cache → friendly no-cache state.
  useEffect(() => {
    const off = auntie.onSnipResult(async ({ dataUrl }) => {
      if (!settings.openaiKey) {
        setShowSettings(true);
        return;
      }
      setSeeError(null);
      setPending('identifying');
      try {
        const identity = await identifyProduct(dataUrl, settings.openaiKey);
        if (!identity) { setPending('no-match'); return; }

        setPending('judging');
        let result: VerdictResult;
        const match = lookupProduct(identity);
        if (match) {
          // Instant, reliable, all-six-signal verdict from cached evidence.
          result = await judgeFromBlob(match.blob, {
            enrich: true,
            openaiKey: settings.openaiKey,
            intent: buyerIntent
          });
        } else if (settings.exaKey) {
          // Live climax: real product not in cache, gather fresh web evidence.
          result = await runLiveJudge({
            product: identity,
            sellerHandle: undefined, // visible seller name not consistently present in screenshot
            intent: buyerIntent,
            openaiKey: settings.openaiKey,
            exaKey: settings.exaKey
          });
        } else {
          setPending('no-cache');
          return;
        }
        if (pendingTriggerClaim) result = { ...result, triggerClaim: pendingTriggerClaim };
        lastVerdictRef.current = result;
        setVerdicts(v => [result, ...v]);
        setPendingTriggerClaim(null);
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
      setListenStatus('Idle');
      setAudioLevel(0);
      return;
    }
    if (!settings.openaiKey) { setShowSettings(true); return; }
    try {
      setTranscript([]);
      setAudioLevel(0);
      listenErrorRef.current = false;
      setListenStatus('Starting audio capture...');
      const transcriber = createTranscriber(settings.openaiKey, {
        onText: async text => {
          listenErrorRef.current = false;
          setListenStatus('Caption received');
          setTranscript(t => [
            ...t.slice(-(MAX_TRANSCRIPT_LINES - 1)),
            { id: newId(), text, at: Date.now() }
          ]);
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
        },
        onError: err => {
          console.warn('[listen] transcribe error', err);
          listenErrorRef.current = true;
          setListenStatus(`Transcription failed: ${err.message}`);
        }
      });
      transcriberRef.current = transcriber;
      const cap = await startDesktopAudioCapture({
        onChunk: pcm => {
          transcriber.push(pcm);
        },
        onLevel: level => {
          if (listenErrorRef.current) return;
          const now = Date.now();
          if (now - lastLevelUpdateRef.current < 250) return;
          lastLevelUpdateRef.current = now;
          setAudioLevel(level);
          setListenStatus(level > 0.012 ? 'Audio detected; transcribing...' : 'Waiting for audible speech...');
        },
        onError: err => {
          console.warn('[listen] capture error', err);
          listenErrorRef.current = true;
          setListenStatus(`Audio capture failed: ${err.message}`);
        }
      });
      captureRef.current = cap;
      setListening(true);
      setListenStatus('Waiting for audible speech...');
    } catch (err) {
      console.error('[LISTEN] failed', err);
      listenErrorRef.current = true;
      setListenStatus(`Listen failed: ${(err as Error).message}`);
      alert('Could not start listening: ' + (err as Error).message);
    }
  }, [listening, settings.openaiKey]);

  useEffect(() => {
    const off = auntie.onToggleListen(() => { void toggleListen(); });
    return () => { off(); };
  }, [toggleListen]);

  // ─── Demo trigger (Alt+Shift+D): the full story off cached evidence ──────
  // Seeds a risky claim bullet + passive nudge (the "passive co-pilot watches a
  // claim" beat), then judges the first cached blob — instant, reliable, all six
  // signals including real buyer voices. No live Exa/GPT dependency for the
  // verdict, so it survives stage wifi. GPT-4o receipt enrichment runs only if an
  // OpenAI key is present (otherwise deterministic findings render). This is the
  // documented safety net (config.ts HOTKEYS.demoTrigger).
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
    const demoTrigger = pending.find(b => b.category === 'medical') ?? pending[0];

    const blob = allCachedProducts()[0];
    if (!blob) {
      setSeeError('No cached demo data. Run `npm run scrape` to generate a cache blob.');
      setDemoNudgeActive(false);
      setPending('error');
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
      const result = await judgeFromBlob(blob, {
        enrich: true,
        openaiKey: settings.openaiKey || undefined,
        intent: buyerIntent
      });
      const resultWithTrigger = demoTrigger
        ? { ...result, triggerClaim: claimToTrigger(demoTrigger) ?? undefined }
        : result;
      lastVerdictRef.current = resultWithTrigger;
      setVerdicts(v => [resultWithTrigger, ...v]);
      setPending('idle');
    } catch (err) {
      console.error('[demo] judgeFromBlob failed', err);
      setSeeError(err instanceof Error ? err.message : 'Demo failed.');
      setPending('error');
    } finally {
      setDemoNudgeActive(false);
    }
  }, [buyerIntent, settings.openaiKey]);

  useEffect(() => {
    const off = auntie.onDemoTrigger(() => { void runDemo(); });
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

  // ─── Restart: wipe the session back to a clean slate ─────────────────────
  // Stops any live listening, drops all verdicts / transcript / claim bullets
  // and resets the deduper. Settings (API keys) and the chosen buyer intent are
  // intentionally preserved so you can immediately start again.
  const resetSession = useCallback(() => {
    captureRef.current?.stop();
    transcriberRef.current?.stop();
    captureRef.current = null;
    transcriberRef.current = null;
    listenErrorRef.current = false;
    lastVerdictRef.current = null;
    dedupeRef.current = new ClaimDeduper();
    setListening(false);
    setListenStatus('Idle');
    setAudioLevel(0);
    setVerdicts([]);
    setTranscript([]);
    setBullets([]);
    setPending('idle');
    setSeeError(null);
    setDismissedNudgeId(null);
    setDemoNudgeActive(false);
    setPendingTriggerClaim(null);
  }, []);

  const hasSession =
    verdicts.length > 0 ||
    transcript.length > 0 ||
    bullets.length > 0 ||
    listening ||
    demoNudgeActive ||
    pending !== 'idle';

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
          <Mascot mood={mascotMood} size={30} />
          <span className="brand-name">AUNTIE</span>
          <span className="brand-sub">{listening ? 'listening' : 'trust co-pilot'}</span>
        </div>
        <div className="controls">
          {verdicts.length > 0 && (
            <button
              className={`header-export ${exported ? 'done' : ''}`}
              title="Copy latest verdict as JSON"
              onClick={async () => {
                const latest = verdicts[0];
                if (!latest) return;
                const ok = await auntie.copyToClipboard(JSON.stringify(latest, null, 2));
                if (ok) {
                  setExported(true);
                  window.setTimeout(() => setExported(false), 1400);
                }
              }}
            >
              {exported ? 'Copied' : 'Export'}
            </button>
          )}
          {hasSession && (
            <button
              className="header-export header-restart"
              title="Clear verdicts, transcript and claims to start fresh"
              onClick={resetSession}
            >
              Restart
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
        <button className="action-btn primary" onClick={() => startProductSnip()}>
          Snip product <span className="kbd">⌥⇧S</span>
        </button>
        <button className={`action-btn ${listening ? 'primary' : ''}`} onClick={toggleListen}>
          {listening ? 'Stop listening' : 'Listen'} <span className="kbd">⌥⇧L</span>
        </button>
      </div>

      <div className="guide-strip">
        <div className={`guide-dot ${listening || demoNudgeActive ? 'live' : ''}`} />
        <div className="guide-text">
          <div className="guide-title">{guide.title}</div>
          <div className="guide-copy">{guide.copy}</div>
        </div>
      </div>

      {(listening || transcript.length > 0) && (
        <details className="live-details" open={listening || transcript.length > 0}>
          <summary>Live monitor</summary>
          <div className="listen-health">
            <div className="listen-health-row">
              <span>{listenStatus}</span>
              <span>{Math.round(Math.min(1, audioLevel) * 100)}%</span>
            </div>
            <div className="listen-meter" aria-hidden="true">
              <span style={{ width: `${Math.round(Math.min(1, audioLevel) * 100)}%` }} />
            </div>
          </div>
          <TranscriptFeed lines={transcript} active={listening} />
          {(listening || bullets.length > 0) && <ClaimsBullets bullets={bullets} />}
        </details>
      )}

      <div className="body">
        <IntentSelector value={buyerIntent} onChange={setBuyerIntent} />

        {showTrustNudge && latestActionableClaim && (
          <TrustNudge
            claim={latestActionableClaim}
            intent={buyerIntent}
            onVerify={() => startProductSnip(latestActionableClaim)}
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

        {pending === 'no-cache' && (
          <div className="card see-status">
            <div className="see-status-title">No cached data for this product</div>
            <div className="see-status-copy">
              Add an Exa key in Settings to judge it live, or try a demo product with Alt+Shift+D.
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
            <div className="empty-mascot"><Mascot mood="idle" size={108} /></div>
            <div className="empty-title">No decision yet</div>
            <div className="empty-copy">Snip a product for an instant read. Listen to catch risky claims while you watch.</div>
          </div>
        )}

        {verdicts.map((r, i) => (
          <RiskFeed
            key={r.generatedAt + '-' + i}
            result={r}
            index={i}
            activeIntent={buyerIntent}
          />
        ))}
      </div>

      <SettingsDrawer
        open={showSettings}
        onClose={() => {
          setShowSettings(false);
          auntie.getSettings().then(setSettings);
        }}
      />
    </div>
  );
}
