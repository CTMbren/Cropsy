import { loadContent, type Content } from './core/content';
import { awaySummary, harvest, newFarm, plant, stageOf, type ActionResult, type AwaySummary, type FarmState } from './core/farm';
import { gameNow, systemNow } from './core/time';
import { loadSave, requestPersistence, writeSave } from './platform/storage';

type Listener = () => void;
export type FxEvent = { kind: 'harvest'; key: string; coins: number; fresh: boolean } | { kind: 'levelup'; level: number } | { kind: 'denied'; key: string; reason: string };

/**
 * The single owner of game state. Phaser (the farm) and Preact (the HUD) both read from it and
 * call its intent methods; neither mutates state directly.
 */
export class Game {
  readonly content: Content = loadContent();
  state: FarmState = newFarm(systemNow());
  selectedCrop = 'radish';
  away: AwaySummary | null = null;
  private listeners = new Set<Listener>();
  private fxListeners = new Set<(e: FxEvent) => void>();
  private saveTimer: number | undefined;

  async init(): Promise<void> {
    const loaded = await loadSave();
    if (loaded) {
      this.state = loaded;
      this.checkAway();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow();
      else this.checkAway();
    });
    window.addEventListener('pagehide', () => this.saveNow());
    this.emit();
  }

  now(): number {
    return gameNow(this.state.time);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onFx(fn: (e: FxEvent) => void): () => void {
    this.fxListeners.add(fn);
    return () => this.fxListeners.delete(fn);
  }

  /** Tap on a plot: harvest if ripe, plant the selected seed if empty. */
  tapPlot(key: string): ActionResult | null {
    const plot = this.state.plots[key];
    if (!plot) return null;
    const now = this.now();
    const stage = stageOf(plot, now);
    let r: ActionResult | null = null;
    if (stage === 'ripe') r = harvest(this.state, this.content, key, now);
    else if (stage === 'empty') r = plant(this.state, this.content, key, this.selectedCrop, now);
    if (!r) return null;
    if (r.ok && r.kind === 'harvested') {
      this.fx({ kind: 'harvest', key, coins: r.coins, fresh: r.fresh });
      if (r.levelsGained) this.fx({ kind: 'levelup', level: this.state.level });
    } else if (!r.ok) {
      this.fx({ kind: 'denied', key, reason: r.reason });
    }
    if (r.ok) {
      this.changed();
      if (r.kind === 'harvested') void requestPersistence();
    }
    return r;
  }

  selectCrop(id: string): void {
    this.selectedCrop = id;
    this.emit();
  }

  dismissAway(): void {
    this.away = null;
    this.state.lastSeen = this.now();
    this.changed();
  }

  /** Debug: fast-forward the game clock. */
  skip(seconds: number): void {
    this.state.time.debugOffset += seconds;
    this.changed();
  }

  replaceState(s: FarmState): void {
    this.state = s;
    this.changed();
  }

  saveNow(): void {
    window.clearTimeout(this.saveTimer);
    if (!this.away) this.state.lastSeen = this.now();
    void writeSave(this.state);
  }

  private checkAway(): void {
    const now = this.now();
    const s = awaySummary(this.state, this.content, now);
    if (s.awaySeconds >= 60 && s.ripe.length) this.away = s;
    else this.state.lastSeen = now;
    this.emit();
  }

  private changed(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 2000);
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  private fx(e: FxEvent): void {
    this.fxListeners.forEach((l) => l(e));
  }
}
