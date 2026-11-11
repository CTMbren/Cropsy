import { fulfilOrder, refreshBoard } from './core/board';
import { loadContent, type Content } from './core/content';
import {
  awaySummary,
  clearObstacle,
  fertilize,
  harvest,
  upgradeSoil,
  log,
  hasFlag,
  newFarm,
  setFlag,
  plant,
  replantAll,
  sell,
  stageOf,
  type ActionResult,
  type AwaySummary,
  type FarmState,
} from './core/farm';
import { giveGift, patMoss, watchEvent, type FriendshipChange, type HeartEvent, type MossFind } from './core/friendship';
import { buyBuilding, collect, startRecipe, upgradeSlots } from './core/processing';
import { markBackedUp, snoozeBackup } from './core/backup';
import { coachHint, type CoachHint } from './core/coach';
import { buyDecor, claimGift, pickUpDecor, placeDecor, type CalendarReward } from './core/decor';
import { buyFromMerchant, syncMerchant, type MerchantResult } from './core/merchant';
import { buyBarn, buyExpansion, buyMaterial, buyTool, deliverStage, marketSell, type BuyResult } from './core/shop';
import { advance, ensureQuestMaterials, onEvent, readMail, refreshQuest, talk, type GameEvent, type StoryOutcome, type TalkResult } from './core/story';
import { dayIndex, gameNow, localOffsetMinutes, systemNow } from './core/time';
import { loadSave, requestPersistence, writeSave } from './platform/storage';

type Listener = () => void;
export type FxEvent =
  | { kind: 'harvest'; key: string; tip: number; fresh: boolean; crop: string; qty: number }
  | { kind: 'plant'; key: string }
  | { kind: 'soil'; key: string; tier: number }
  | { kind: 'fertilize'; key: string }
  | { kind: 'clear'; key: string; obstacle: string; item: string | null; qty: number; gold: boolean }
  | { kind: 'coins'; amount: number }
  | { kind: 'ribbon'; amount: number; why: string }
  | { kind: 'heart'; villager: string; hearts: number; perk?: string }
  | { kind: 'gift'; villager: string; taste: string }
  | { kind: 'shipped'; n: number; coins: number }
  | { kind: 'collect'; building: string; items: Record<string, number> }
  | { kind: 'levelup'; level: number }
  | { kind: 'quest'; title: string; done: boolean }
  | { kind: 'expand' }
  | { kind: 'chapter'; n: number }
  | { kind: 'star'; crop: string; stars: number }
  | { kind: 'moss'; find: MossFind }
  | { kind: 'decor'; spot: string; placed: boolean }
  | { kind: 'denied'; key: string; reason: string }
  | { kind: 'ui' };

/** Screen-space effects the farm scene asks the HUD to draw (e.g. coins flying to the coin pill). */
export type ScreenFx = { kind: 'coin-fly'; x: number; y: number; amount: number } | { kind: 'open-building'; id: string };

/**
 * The single owner of game state. Phaser (the farm) and Preact (the HUD) both read from it and
 * call its intent methods; neither mutates state directly.
 */
export class Game {
  readonly content: Content = loadContent();
  state: FarmState = newFarm(systemNow());
  selectedCrop = 'radish';
  /** What a tap on an empty or growing plot does: plant the selected seed, fertilize, or upgrade soil. */
  mode: 'plant' | 'fertilize' | 'soil' | 'decorate' = 'plant';
  /** In decorate mode: the decoration a tap on an empty spot places. */
  selectedDecor: string | null = null;
  away: AwaySummary | null = null;
  private listeners = new Set<Listener>();
  private fxListeners = new Set<(e: FxEvent) => void>();
  private screenListeners = new Set<(e: ScreenFx) => void>();
  private saveTimer: number | undefined;

  async init(): Promise<void> {
    try {
      const loaded = await loadSave();
      if (loaded) this.state = loaded;
    } catch (e) {
      console.error('Could not load save', e);
    }
    const now = this.now();
    // saves from before title cards: don't replay cards for chapters already under way
    if (this.state.story.done.length && !this.state.flags.some((f) => f.startsWith('chapter:'))) {
      for (const id of [...this.state.story.done, this.state.story.active?.id]) {
        const q = id ? this.content.questById.get(id) : undefined;
        if (q) setFlag(this.state, `chapter:${q.chapter}`);
      }
    }
    this.applyStory(advance(this.state, this.content, now, this.tz()));
    refreshQuest(this.state, this.content);
    this.checkAway();
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

  private tz(): number {
    return localOffsetMinutes();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onFx(fn: (e: FxEvent) => void): () => void {
    this.fxListeners.add(fn);
    return () => this.fxListeners.delete(fn);
  }

  onScreenFx(fn: (e: ScreenFx) => void): () => void {
    this.screenListeners.add(fn);
    return () => this.screenListeners.delete(fn);
  }

  screenFx(e: ScreenFx): void {
    this.screenListeners.forEach((l) => l(e));
  }

  /** Tap on a plot: clear an obstacle, harvest if ripe, or plant the selected seed. */
  tapPlot(key: string): ActionResult | null {
    const plot = this.state.plots[key];
    if (!plot || this.mode === 'decorate') return null;
    const now = this.now();
    if (this.mode === 'soil') {
      const r = upgradeSoil(this.state, this.content, key);
      if (r.ok) {
        this.fx({ kind: 'soil', key, tier: r.tier });
        log(this.state, now, `soil ${key} ${r.tier}`);
        this.changed();
      } else this.fx({ kind: 'denied', key, reason: r.reason });
      return null;
    }
    if (this.mode === 'fertilize' && plot.crop && stageOf(plot, now) !== 'ripe') {
      const r = fertilize(this.state, key, now);
      if (r.ok) {
        this.fx({ kind: 'fertilize', key });
        if (!(this.state.inventory.fertilizer ?? 0)) this.mode = 'plant';
        this.changed();
      } else this.fx({ kind: 'denied', key, reason: r.reason });
      return null;
    }
    let r: ActionResult | null = null;
    if (this.state.obstacles[key]) r = clearObstacle(this.state, key);
    else if (stageOf(plot, now) === 'ripe') r = harvest(this.state, this.content, key, now);
    else if (!plot.crop) r = plant(this.state, this.content, key, this.selectedCrop, now);
    if (!r) return null;
    if (!r.ok) {
      this.fx({ kind: 'denied', key, reason: r.reason });
      return r;
    }
    if (r.kind === 'harvested') {
      this.fx({ kind: 'harvest', key, tip: r.tip, fresh: r.fresh, crop: r.crop.id, qty: r.qty });
      if (r.firstTime) this.fx({ kind: 'ribbon', amount: 1, why: `First ${r.crop.name} harvest!` });
      if (r.star) this.fx({ kind: 'star', crop: r.crop.name, stars: r.star });
      if (r.shipped) this.fx({ kind: 'shipped', n: r.shipped, coins: r.tip });
      this.levelUps(r.levelsGained);
      this.event({ type: 'harvest', crop: r.crop.id });
      log(this.state, now, `harvest ${r.crop.id}${r.fresh ? ' fresh' : ''}`);
      void requestPersistence();
    } else if (r.kind === 'planted') {
      this.fx({ kind: 'plant', key });
    } else if (r.kind === 'cleared') {
      this.fx({ kind: 'clear', key, obstacle: r.obstacle, item: r.item, qty: r.qty, gold: r.gold });
      this.levelUps(r.levelsGained);
      this.event({ type: 'clear', obstacle: r.obstacle });
      log(this.state, now, `clear ${r.obstacle}`);
    }
    this.changed();
    return r;
  }

  replantAll(): number {
    const planted = replantAll(this.state, this.content, this.now());
    planted.forEach((key) => this.fx({ kind: 'plant', key }));
    if (planted.length) this.changed();
    return planted.length;
  }

  sell(cropId: string, n: number): number {
    const before = this.state.inventory[cropId] ?? 0;
    const coins = sell(this.state, this.content, cropId, n);
    if (!coins) return 0;
    const sold = before - (this.state.inventory[cropId] ?? 0);
    this.fx({ kind: 'coins', amount: coins });
    log(this.state, this.now(), `sell ${sold} ${cropId}`);
    this.event({ type: 'sell', n: sold });
    this.changed();
    return coins;
  }

  sellAll(): number {
    let total = 0;
    for (const id of Object.keys(this.state.inventory)) if (this.content.cropById.has(id) || this.content.goods.has(id)) total += this.sell(id, Infinity);
    return total;
  }

  fulfilOrder(id: string): boolean {
    const r = fulfilOrder(this.state, this.content, id);
    if (!r.ok) return false;
    this.fx({ kind: 'coins', amount: r.order.coins });
    this.levelUps(r.levelsGained);
    this.friendFx(r.friendship);
    log(this.state, this.now(), `order ${id}`);
    this.event({ type: 'order_done', id });
    this.changed();
    return true;
  }

  day(): number {
    return dayIndex(this.now(), this.tz());
  }

  marketSell(itemId: string, n: number): number {
    const coins = marketSell(this.state, this.content, itemId, n, this.day());
    if (!coins) return 0;
    this.fx({ kind: 'coins', amount: coins });
    log(this.state, this.now(), `market ${itemId} ${coins}`);
    this.event({ type: 'sell', n: Math.min(n, 999) });
    this.changed();
    return coins;
  }

  buyTool(id: string): BuyResult {
    const r = buyTool(this.state, this.content, id);
    if (r.ok) {
      this.fx({ kind: 'ui' });
      log(this.state, this.now(), `buy ${id}`);
      this.changed();
    }
    return r;
  }

  buyExpansion(): BuyResult {
    const r = buyExpansion(this.state, this.content);
    if (r.ok) {
      this.fx({ kind: 'expand' });
      log(this.state, this.now(), `expand ${this.state.width}`);
      this.changed();
    }
    return r;
  }

  buyBuilding(id: string): boolean {
    const ok = buyBuilding(this.state, this.content, id);
    if (ok) {
      this.fx({ kind: 'quest', title: `${this.content.buildings.get(id)?.name} built`, done: true });
      log(this.state, this.now(), `build ${id}`);
      this.changed();
    }
    return ok;
  }

  startRecipe(buildingId: string, recipeId: string): boolean {
    const r = startRecipe(this.state, this.content, buildingId, recipeId, this.now());
    if (r.ok) {
      this.fx({ kind: 'ui' });
      this.changed();
    }
    return r.ok;
  }

  collect(buildingId: string): number {
    const r = collect(this.state, this.content, buildingId, this.now());
    const n = Object.values(r.items).reduce((a, b) => a + b, 0);
    if (n) {
      this.fx({ kind: 'collect', building: buildingId, items: r.items });
      this.levelUps(r.levelsGained);
      log(this.state, this.now(), `collect ${buildingId} ${n}`);
      this.changed();
    }
    return n;
  }

  upgradeSlots(buildingId: string): boolean {
    const ok = upgradeSlots(this.state, this.content, buildingId);
    if (ok) this.changed();
    return ok;
  }

  deliverProject(id: string): boolean {
    const r = deliverStage(this.state, this.content, id);
    if (!r.ok) return false;
    this.fx({ kind: 'quest', title: `${this.content.projects.get(id)?.name}: stage ${r.stage} done`, done: true });
    log(this.state, this.now(), `project ${id} ${r.stage}`);
    this.event({ type: 'project', id, stage: r.stage });
    this.changed();
    return true;
  }

  buyDecor(id: string): boolean {
    const r = buyDecor(this.state, this.content, id);
    if (r.ok) {
      this.fx({ kind: 'ui' });
      log(this.state, this.now(), `decor ${id}`);
      this.changed();
    }
    return r.ok;
  }

  selectDecor(id: string | null): void {
    this.selectedDecor = id;
    this.mode = 'decorate';
    this.fx({ kind: 'ui' });
    this.emit();
  }

  /** Tap a decoration spot in decorate mode: pick up what's there, or place the selected one. */
  tapSpot(spot: string): void {
    if (this.mode !== 'decorate') return;
    if (this.state.decor?.[spot]) {
      pickUpDecor(this.state, spot);
      this.fx({ kind: 'decor', spot, placed: false });
    } else if (this.selectedDecor) {
      const r = placeDecor(this.state, this.selectedDecor, spot);
      if (!r.ok) return;
      this.fx({ kind: 'decor', spot, placed: true });
      if (!this.state.decorStore?.[this.selectedDecor]) this.selectedDecor = Object.keys(this.state.decorStore ?? {})[0] ?? null;
    } else return;
    this.changed();
  }

  /** The guided first minutes: what to do next, or null once Chapter 1's tutorial part is over. */
  coach(): CoachHint | null {
    if (this.mode !== 'plant') return null;
    return coachHint(this.state, this.content, this.now(), this.selectedCrop);
  }

  backedUp(): void {
    markBackedUp(this.state, this.now());
    log(this.state, this.now(), 'backup');
    this.changed();
  }

  snoozeBackup(): void {
    snoozeBackup(this.state, this.now());
    this.changed();
  }

  claimGift(): CalendarReward | null {
    const r = claimGift(this.state, this.content, this.day());
    if (r) {
      this.fx({ kind: 'ui' });
      log(this.state, this.now(), 'calendar');
      this.changed();
    }
    return r;
  }

  /** Watch a heart event; returns its scene for the dialogue box. */
  watchEvent(villager: string, hearts: number): HeartEvent | null {
    const r = watchEvent(this.state, this.content, villager, hearts);
    if (!r) return null;
    this.fx({ kind: 'ribbon', amount: r.ribbons, why: r.event.title });
    log(this.state, this.now(), `event ${villager} ${hearts}`);
    this.changed();
    return r.event;
  }

  /** Tap Moss: he digs up today's find. */
  patMoss(): MossFind | null {
    const f = patMoss(this.state, this.day());
    if (!f) {
      this.fx({ kind: 'ui' });
      return null;
    }
    this.fx({ kind: 'moss', find: f });
    log(this.state, this.now(), `moss ${'coins' in f ? `${f.coins} coins` : `${f.qty} ${f.item}`}`);
    this.changed();
    return f;
  }

  buyMerchant(index: number): MerchantResult {
    const r = buyFromMerchant(this.state, this.content, index, this.day());
    if (r.ok) {
      this.fx({ kind: 'ui' });
      log(this.state, this.now(), `merchant ${r.slot.kind === 'seed' ? r.slot.crop : r.slot.id}`);
      this.event({ type: 'merchant_buy' });
      this.changed();
    }
    return r;
  }

  readMail(id: string): void {
    const out = readMail(this.state, this.content, id, this.now(), this.tz());
    this.applyStory(out);
    if (out.expanded) {
      this.fx({ kind: 'expand' });
      log(this.state, this.now(), 'expand');
    }
    this.changed();
  }

  /** Tap on the visiting villager. */
  talk(): TalkResult {
    const r = talk(this.state, this.content, this.now(), this.tz());
    if (r.kind === 'outro') this.applyStory(r.outcome);
    if (r.kind !== 'none') this.changed();
    return r;
  }

  setMode(mode: 'plant' | 'fertilize' | 'soil' | 'decorate'): void {
    this.mode = mode;
    this.fx({ kind: 'ui' });
    this.emit();
  }

  gift(villager: string, itemId: string): boolean {
    const r = giveGift(this.state, this.content, villager, itemId, this.day());
    if (!r.ok) return false;
    this.fx({ kind: 'gift', villager, taste: r.taste });
    this.friendFx(r);
    log(this.state, this.now(), `gift ${villager} ${itemId} ${r.taste}`);
    this.changed();
    return true;
  }

  buyBarn(): BuyResult {
    const r = buyBarn(this.state, this.content);
    if (r.ok) {
      this.fx({ kind: 'quest', title: 'Barn upgraded', done: true });
      this.changed();
    }
    return r;
  }

  buyMaterial(id: string): BuyResult {
    const r = buyMaterial(this.state, this.content, id);
    if (r.ok) {
      this.fx({ kind: 'ui' });
      this.changed();
    }
    return r;
  }

  buyFertilizer(n: number): BuyResult {
    const r = buyTool(this.state, this.content, 'fertilizer', n);
    if (r.ok) this.changed();
    return r;
  }

  selectCrop(id: string): void {
    this.selectedCrop = id;
    this.mode = 'plant';
    this.fx({ kind: 'ui' });
    this.emit();
  }

  setMusic(on: boolean): void {
    this.state.settings.music = on;
    this.changed();
  }

  setTextScale(scale: number): void {
    this.state.settings.textScale = scale;
    this.changed();
  }

  setMuted(muted: boolean): void {
    this.state.settings.muted = muted;
    this.changed();
  }

  dismissAway(): void {
    this.away = null;
    this.state.lastSeen = this.now();
    this.changed();
  }

  /** Debug: fast-forward the game clock. */
  skip(seconds: number): void {
    this.state.time.debugOffset += seconds;
    this.checkAway();
    this.changed();
  }

  replaceState(s: FarmState): void {
    this.state = s;
    this.applyStory(advance(this.state, this.content, this.now(), this.tz()));
    this.changed();
  }

  saveNow(): void {
    window.clearTimeout(this.saveTimer);
    if (!this.away) this.state.lastSeen = this.now();
    void writeSave(this.state);
  }

  private event(e: GameEvent): void {
    this.applyStory(onEvent(this.state, this.content, e, this.now(), this.tz()));
  }

  private friendFx(f?: FriendshipChange): void {
    if (!f) return;
    if (f.heartsAfter > f.heartsBefore) this.fx({ kind: 'heart', villager: f.villager, hearts: f.heartsAfter, perk: f.perk });
  }

  private applyStory(o: StoryOutcome): void {
    this.levelUps(o.levelsGained);
    this.friendFx(o.friendship);
    if (o.completed) {
      this.fx({ kind: 'quest', title: o.completed.title, done: true });
      log(this.state, this.now(), `quest done ${o.completed.id}`);
    }
    if (o.started && o.started.giver !== 'mail') this.fx({ kind: 'quest', title: o.started.title, done: false });
    // a title card the first time a chapter begins
    const q = this.state.story.active ? this.content.questById.get(this.state.story.active.id) : undefined;
    if (q && !hasFlag(this.state, `chapter:${q.chapter}`)) {
      setFlag(this.state, `chapter:${q.chapter}`);
      this.fx({ kind: 'chapter', n: q.chapter });
    }
  }

  private levelUps(n: number): void {
    if (n > 0) {
      this.fx({ kind: 'levelup', level: this.state.level });
      log(this.state, this.now(), `level ${this.state.level}`);
      // a new level can unlock the next chapter
      this.applyStory(advance(this.state, this.content, this.now(), this.tz()));
    }
  }

  private checkAway(): void {
    const now = this.now();
    const refreshed = refreshBoard(this.state, this.content, now, this.tz());
    const s = awaySummary(this.state, this.content, now, refreshed);
    log(this.state, now, 'session');
    if (s.awaySeconds >= 60 && (s.ripe.length || s.newMail || s.newOrders)) this.away = s;
    else this.state.lastSeen = now;
    this.emit();
  }

  private changed(): void {
    // fix Ziggy's stock for the day when his cart is in town
    syncMerchant(this.state, this.content, this.day());
    // keep the active quest possible (places missing weeds, branches or rocks on free plots)
    ensureQuestMaterials(this.state, this.content);
    // quests measured from the farm (crops discovered, mastery) can finish without an event
    refreshQuest(this.state, this.content);
    // board opens mid-session when the story sets its flag
    refreshBoard(this.state, this.content, this.now(), this.tz());
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
