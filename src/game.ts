import { fulfilOrder, refreshBoard } from './core/board';
import { loadContent, type Content } from './core/content';
import {
  awaySummary,
  clearObstacle,
  digUp,
  fertilize,
  harvest,
  upgradeSoil,
  log,
  hasFlag,
  newFarm,
  setFlag,
  plant,
  unplant,
  chooseMastery,
  type MasteryPick,
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
import { syncCritters, tapCritter, type TapResult } from './core/critters';
import { catchFish, rollFish, syncBites, type CatchResult, type FishDef } from './core/fishing';
import { startClearing, syncLand, type ClearResult } from './core/land';
import { coachHint, type CoachHint } from './core/coach';
import { buildImprovement, deliverTownProject, raiseTownLevel, syncTownProject, townLevel } from './core/town';
import { buyDecor, claimGift, pickUpDecor, placeDecor, type CalendarReward } from './core/decor';
import { buyFromMerchant, syncMerchant, type MerchantResult } from './core/merchant';
import { buyBarn, buyMaterial, buyTool, deliverStage, marketSell, type BuyResult } from './core/shop';
import { advance, ensureQuestMaterials, onEvent, readMail, refreshQuest, restoreQuestFlags, ensureQuestMail, talk, type GameEvent, type StoryOutcome, type TalkResult } from './core/story';
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
  | { kind: 'star'; crop: string; id: string; stars: number }
  | { kind: 'moss'; find: MossFind }
  | { kind: 'decor'; spot: string; placed: boolean }
  | { kind: 'dug'; key: string }
  | { kind: 'unplant'; key: string; refund: number }
  | { kind: 'land'; cell: string; item: string; qty: number; gold: boolean }
  | { kind: 'clearing'; cell: string }
  | { kind: 'critter'; key: string; result: Extract<TapResult, { ok: true }> }
  | { kind: 'denied'; key: string; reason: string }
  | { kind: 'ui' };

/** Screen-space effects the farm scene asks the HUD to draw (e.g. coins flying to the coin pill). */
export type ScreenFx = { kind: 'coin-fly'; x: number; y: number; amount: number } | { kind: 'open-building'; id: string } | { kind: 'open-crop'; key: string } | { kind: 'open-land'; cell: string } | { kind: 'pick-seed'; key: string };

/**
 * The single owner of game state. Phaser (the farm) and Preact (the HUD) both read from it and
 * call its intent methods; neither mutates state directly.
 */
export class Game {
  readonly content: Content = loadContent();
  state: FarmState = newFarm(systemNow());
  /** The armed seed. Null until the player picks one, so a stray tap never plants. */
  selectedCrop: string | null = null;
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
    const resent = ensureQuestMail(this.state, this.content, now, this.tz());
    if (resent.length) log(this.state, now, `resent ${resent.join(' ')}`);
    const restored = restoreQuestFlags(this.state, this.content);
    if (restored.length) log(this.state, now, `restored ${restored.join(' ')}`);
    this.applyStory(advance(this.state, this.content, now, this.tz()));
    refreshQuest(this.state, this.content);
    this.checkAway();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.saveNow();
        this.selectedCrop = null;
      }
      else this.checkAway();
    });
    window.addEventListener('pagehide', () => this.saveNow());
    this.finishClearing();
    syncCritters(this.state, this.content, this.now());
    syncBites(this.state, this.content, this.now());
    // visitors (and bites at the creek) arrive while the app is open, too
    window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const before = JSON.stringify(this.state.critters?.out ?? []);
      syncCritters(this.state, this.content, this.now());
      const bites = syncBites(this.state, this.content, this.now());
      const cleared = this.state.clearing && this.now() >= this.state.clearing.endsAt;
      if (cleared || bites || JSON.stringify(this.state.critters?.out ?? []) !== before) this.changed();
    }, 5000);
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

  /**
   * Tap on a plot: clear an obstacle, harvest if ripe, or plant the selected seed. `drag` is true when
   * the finger is sweeping across plots; only a plain tap opens the seed picker or undoes a planting.
   */
  tapPlot(key: string, drag = false): ActionResult | null {
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
    else if (!plot.crop) {
      if (!this.selectedCrop) {
        if (!drag && this.mode === 'plant') this.screenFx({ kind: 'pick-seed', key });
        return null;
      }
      r = plant(this.state, this.content, key, this.selectedCrop, now);
    } else if (!drag && this.mode === 'plant') {
      const u = unplant(this.state, this.content, key, now);
      if (u.ok) {
        this.fx({ kind: 'unplant', key, refund: u.refund });
        log(this.state, now, `unplant ${u.crop}`);
        this.changed();
        return null;
      }
    }
    if (!r) return null;
    if (!r.ok) {
      this.fx({ kind: 'denied', key, reason: r.reason });
      return r;
    }
    if (r.kind === 'harvested') {
      this.fx({ kind: 'harvest', key, tip: r.tip, fresh: r.fresh, crop: r.crop.id, qty: r.qty });
      if (r.firstTime) this.fx({ kind: 'ribbon', amount: 1, why: `First ${r.crop.name} harvest!` });
      if (r.star) this.fx({ kind: 'star', crop: r.crop.name, id: r.crop.id, stars: r.star });
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

  /** Hire Bruno's crew to clear one wild cell next to the field. */
  startClearing(cell: string): ClearResult {
    const r = startClearing(this.state, this.content, cell, this.now());
    if (r.ok) {
      this.fx({ kind: 'clearing', cell });
      log(this.state, this.now(), `clearing ${cell}`);
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

  buildImprovement(id: string): boolean {
    const r = buildImprovement(this.state, this.content, id);
    if (r.ok) {
      this.fx({ kind: 'quest', title: `${this.content.economy.improvements?.find((x) => x.id === id)?.name ?? id} built`, done: true });
      log(this.state, this.now(), `improve ${id}`);
      this.changed();
    }
    return r.ok;
  }

  raiseTownLevel(): boolean {
    const r = raiseTownLevel(this.state, this.content);
    if (r.ok) {
      this.fx({ kind: 'quest', title: `Bramblewick is now town level ${townLevel(this.state)}`, done: true });
      log(this.state, this.now(), `town level ${townLevel(this.state)}`);
      this.changed();
    }
    return r.ok;
  }

  deliverTownProject(): boolean {
    const r = deliverTownProject(this.state, this.content, this.day());
    if (r.ok) {
      this.fx({ kind: 'ribbon', amount: r.project.ribbons, why: 'Town project complete!' });
      log(this.state, this.now(), 'town project');
      this.changed();
    }
    return r.ok;
  }

  /** The guided first minutes: what to do next, or null once Chapter 1's tutorial part is over. */
  coach(): CoachHint | null {
    if (this.mode !== 'plant') return null;
    return coachHint(this.state, this.content, this.now());
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

  /** Turns a finished clearing job into a plot (called on every change and by the 5 s ticker). */
  private finishClearing(): void {
    const r = syncLand(this.state, this.content, this.now());
    if (!r) return;
    this.fx({ kind: 'land', ...r });
    log(this.state, this.now(), `cleared ${r.cell}`);
  }

  /** Tap a visiting critter: pollen (toward honey), and a sketch the first time. */
  tapCritter(id: number): void {
    const plot = this.state.critters?.out.find((v) => v.id === id)?.plot;
    const r = tapCritter(this.state, this.content, id);
    if (!r.ok || !plot) return;
    this.fx({ kind: 'critter', key: plot, result: r });
    if (r.firstTime) log(this.state, this.now(), `sketched ${r.species.id}`);
    this.changed();
  }

  /** What's on the line for the next cast, picked by the local time of day. */
  rollFish(): FishDef {
    return rollFish(this.state, this.now(), this.tz(), Math.random());
  }

  /** Reeled in on time: the fish goes to the barn and the Creek Journal. */
  catchFish(fishId: string): CatchResult {
    const r = catchFish(this.state, this.content, fishId, this.now());
    if (!r.ok) return r;
    this.fx({ kind: 'ui' });
    log(this.state, this.now(), `fish ${fishId}`);
    if (r.pageDone) this.fx({ kind: 'ribbon', amount: 1, why: 'Creek Journal page' });
    this.friendFx(r.friendship);
    this.event({ type: 'fish', fish: fishId });
    this.changed();
    return r;
  }

  /** Dig up a growing crop early (it's destroyed, no refund). */
  digUp(key: string): boolean {
    const r = digUp(this.state, key, this.now());
    if (!r.ok) return false;
    this.fx({ kind: 'dug', key });
    log(this.state, this.now(), `dig up ${r.crop}`);
    this.changed();
    return true;
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

  /** From the seed picker: arm the seed and plant the plot that was tapped. */
  plantPicked(key: string, cropId: string): void {
    this.selectedCrop = cropId;
    this.mode = 'plant';
    this.tapPlot(key);
    this.emit();
  }

  /** Spend a mastery level on +5% coins or +5% XP for that crop. */
  chooseMastery(cropId: string, pick: MasteryPick): void {
    if (!chooseMastery(this.state, cropId, pick)) return;
    log(this.state, this.now(), `mastery ${cropId} ${pick}`);
    this.changed();
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

  /** Arms a seed from the tray. Tapping the armed seed again disarms it. */
  selectCrop(id: string | null): void {
    this.selectedCrop = this.mode === 'plant' && this.selectedCrop === id ? null : id;
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
    syncTownProject(this.state, this.content, this.day());
    this.finishClearing();
    syncCritters(this.state, this.content, this.now());
    syncBites(this.state, this.content, this.now());
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
