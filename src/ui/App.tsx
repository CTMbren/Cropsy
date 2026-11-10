import { useEffect, useState } from 'preact/hooks';
import { nextReady, unlockedCrops } from '../core/farm';
import { xpToNext } from '../core/progression';
import { fromSaveCode, toSaveCode } from '../core/save';
import { formatDuration } from '../core/time';
import type { Game } from '../game';
import { lastSavedAt } from '../platform/storage';

function useGame(game: Game): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = game.subscribe(() => setTick((t) => t + 1));
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, [game]);
  return game.now();
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function App({ game, updateReady, onUpdate, debug }: { game: Game; updateReady: boolean; onUpdate: () => void; debug: boolean }) {
  const now = useGame(game);
  const s = game.state;
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [installHint, setInstallHint] = useState(false);

  useEffect(
    () =>
      game.onFx((e) => {
        if (e.kind === 'levelup') setToast(`Level ${e.level}! New seeds unlocked`);
        if (e.kind === 'harvest' && !isStandalone() && isIOS()) setInstallHint(true);
      }),
    [game],
  );
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const need = xpToNext(s.level);
  const ready = nextReady(s, now);
  const unlocked = new Set(unlockedCrops(s, game.content).map((c) => c.id));

  return (
    <div class="ui">
      <header class="hud">
        <div class="level" aria-label={`Level ${s.level}`}>
          <span class="star">{s.level}</span>
          <div class="xp">
            <div class="xp-label">LV {s.level} <small>{s.xp}/{need}</small></div>
            <div class="xp-bar"><div style={{ width: `${Math.min(100, (s.xp / need) * 100)}%` }} /></div>
          </div>
        </div>
        <div class="pill coins" aria-label={`${s.coins} coins`}>
          <span class="coin" aria-hidden="true" />
          {s.coins.toLocaleString()}
        </div>
        <button class="round" aria-label="Settings" onClick={() => setSettings(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>

      {ready !== null && <div class="next-ready">Next harvest in {formatDuration(ready)}</div>}
      {toast && <div class="toast" role="status">{toast}</div>}
      {updateReady && (
        <button class="toast update" onClick={onUpdate}>A fresh harvest of updates is ready — tap to update</button>
      )}

      {game.away && (
        <div class="modal-back">
          <div class="card" role="dialog" aria-labelledby="away-title">
            <h2 id="away-title">While you were away</h2>
            <p class="muted">{formatDuration(game.away.awaySeconds)} went by on the farm.</p>
            <ul class="away-list">
              {game.away.ripe.map((r) => (
                <li key={r.crop}><b>{r.count}×</b> {r.crop} ready to harvest</li>
              ))}
            </ul>
            <button class="btn green" onClick={() => game.dismissAway()}>Let's harvest!</button>
          </div>
        </div>
      )}

      {installHint && (
        <div class="install">
          <b>Keep your farm safe</b>
          <span>Tap <ShareIcon /> then <b>Add to Home Screen</b>. Safari can clear saves for sites not on your home screen.</span>
          <button class="x" aria-label="Dismiss" onClick={() => setInstallHint(false)}>×</button>
        </div>
      )}

      <section class="tray" aria-label="Plant a seed">
        <h2>Plant a Seed <small>tap or drag across plots</small></h2>
        <div class="seeds">
          {game.content.crops.map((c) => {
            const locked = !unlocked.has(c.id);
            const selected = game.selectedCrop === c.id;
            return (
              <button
                key={c.id}
                class={`seed${selected ? ' selected' : ''}${locked ? ' locked' : ''}`}
                disabled={locked}
                aria-pressed={selected}
                onClick={() => game.selectCrop(c.id)}
              >
                <span class="seed-icon" style={{ background: c.color }} aria-hidden="true" />
                <span class="seed-name">{c.name}</span>
                {locked ? (
                  <span class="chip lock">Lv {c.unlock_level}</span>
                ) : (
                  <>
                    <span class="chip time">{formatDuration(c.grow_s)}</span>
                    <span class="cost"><span class="coin sm" aria-hidden="true" />{c.seed_cost}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {settings && <Settings game={game} onClose={() => setSettings(false)} debug={debug} />}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-label="Share" role="img" style={{ verticalAlign: '-3px' }}>
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" />
    </svg>
  );
}

function Settings({ game, onClose, debug }: { game: Game; onClose: () => void; debug: boolean }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const saved = lastSavedAt();
  return (
    <div class="modal-back">
      <div class="card" role="dialog" aria-labelledby="settings-title">
        <h2 id="settings-title">Farm settings</h2>
        <p class="muted">Last saved {saved ? new Date(saved).toLocaleTimeString() : 'not yet'}.</p>
        <label class="field">
          <span>Backup code</span>
          <textarea rows={3} value={code} onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} placeholder="Tap “Copy backup code”, or paste one here to restore" />
        </label>
        <div class="row">
          <button
            class="btn"
            onClick={async () => {
              const c = toSaveCode(game.state);
              setCode(c);
              try {
                await navigator.clipboard.writeText(c);
                setMsg('Copied! Keep it somewhere safe.');
              } catch {
                setMsg('Select the code above and copy it.');
              }
            }}
          >
            Copy backup code
          </button>
          <button
            class="btn"
            onClick={() => {
              try {
                game.replaceState(fromSaveCode(code));
                setMsg('Farm restored.');
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Restore
          </button>
        </div>
        {msg && <p class="muted" role="status">{msg}</p>}
        {debug && (
          <div class="row">
            <button class="btn" onClick={() => game.skip(60)}>+1 min</button>
            <button class="btn" onClick={() => game.skip(3600)}>+1 h</button>
            <button class="btn" onClick={() => game.skip(86400)}>+1 day</button>
          </div>
        )}
        <button class="btn green" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
