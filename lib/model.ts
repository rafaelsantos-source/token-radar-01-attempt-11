// Token Radar, variant 11: a multi-signal ensemble.
//
// One snapshot of the protocol universe in, one ranked board out. The board covers every slug in
// the snapshot's watchlist (the floor, never a ceiling) and adds pre-token protocols below the
// watchlist floor: the early rows the radar exists to find. A protocol is pre-token when its index
// entry records no token (no market cap, no CoinGecko id, no symbol); the snapshot's live-token
// protocols are kept apart and shown as the market's own values, never mixed into the ranked board.
//
// Implied value is an ENSEMBLE of three sub-models, all computed from the snapshot's own figures
// at run time. No protocol name is ever special-cased: the same functions score every row.
//
//   M1 comps      = tvl_usd x categoryMedianMultiple
//                   The market's own multiple: the median mcap/TVL of live-token protocols in
//                   the same category (global median when the category has too few live comps).
//   M2 growth     = tvl_usd x globalMedianMultiple x growthAdj
//                   growthAdj rewards 7-day TVL growth and penalises decline at half rate,
//                   clamped to [-40%, +80%] so one wild week cannot decide a rank.
//   M3 composite  = tvl_usd x globalMedianMultiple x seasoning x reach x momentum x stability
//                   seasoning: a hump over age with no token (peaks near 900 days, fades for the
//                   very old, who likely never launch, and the very young); reach: log chain
//                   breadth; momentum: tanh-scaled 7d change; stability: a penalty for extreme
//                   |7d change|, because a spike is not a trend.
//
//   implied = exp(0.45 ln M1 + 0.25 ln M2 + 0.30 ln M3)   (geometric blend, weights in ENSEMBLE)
//   confidence = agreement of the three sub-models (1 = they agree, 0 = they disagree wildly),
//                shown on the board, never used to move a rank.
//
// The dashboard ships the three sub-model values per row, so a reader can re-weight the ensemble
// live in the page (the model lab) and watch the board re-rank: the ranking is the model's claim,
// and the claim is checkable.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The ensemble's weights and clamps, as the dashboard states them and the lab may change them. */
export interface EnsembleWeights {
  comps: number;
  growth: number;
  composite: number;
  growth_floor: number;
  growth_cap: number;
  decline_half_rate: number;
  seasoning_peak_days: number;
  seasoning_floor: number;
  seasoning_old_days: number;
  reach_per_log_chain: number;
  momentum_scale: number;
  stability_cutoff: number;
  stability_max_penalty: number;
  min_category_comps: number;
}

export const ENSEMBLE: EnsembleWeights = {
  comps: 0.45,
  growth: 0.25,
  composite: 0.3,
  growth_floor: -40,
  growth_cap: 80,
  decline_half_rate: 0.5,
  seasoning_peak_days: 900,
  seasoning_floor: 0.55,
  seasoning_old_days: 2200,
  reach_per_log_chain: 0.06,
  momentum_scale: 25,
  stability_cutoff: 30,
  stability_max_penalty: 0.25,
  min_category_comps: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'ensemble-11';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    version: string;
    comps_multiple: number;
    global_multiple: number;
    m1_comps: number;
    m2_growth: number;
    m3_composite: number;
    growth_pct: number;
    growth_adjustment: number;
    seasoning: number;
    reach: number;
    momentum: number;
    stability: number;
    confidence: number;
    weights: { comps: number; growth: number; composite: number };
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the ensemble's parts for the model lab. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  m1_comps: number;
  m2_growth: number;
  m3_composite: number;
  confidence: number;
  comps_multiple: number;
  seasoning: number;
  reach: number;
  momentum: number;
  stability: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One category's comp multiple, for the model card. */
export interface CategoryComp {
  category: string;
  live_count: number;
  median_multiple: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  ensemble: EnsembleWeights;
  model_version: string;
  global_multiple: number;
  category_comps: CategoryComp[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of a non-empty list; null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name that is a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange's name at the start of a protocol name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories that are a wrapped, staked or bridged product, not a launch candidate. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and a genuine launch candidate under
 * the watchlist's own exclusion rule (no exchange, no bridge/staking wrapper, no versioned pool,
 * no wrapped/staked name). The watchlist is the floor; the early rows are held to the same bar.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The market multiples the ensemble reads: global median and per-category medians of mcap/TVL. */
export interface MarketMultiples {
  global: number;
  byCategory: Map<string, number>;
}

export function marketMultiples(snapshot: Snapshot): MarketMultiples {
  const all: number[] = [];
  const perCat = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    if (p.category !== null) {
      const list = perCat.get(p.category) ?? [];
      list.push(ratio);
      perCat.set(p.category, list);
    }
  }
  const global = median(all) ?? 0.25;
  const byCategory = new Map<string, number>();
  for (const [cat, list] of perCat) {
    if (list.length >= ENSEMBLE.min_category_comps) {
      const m = median(list);
      if (m !== null) byCategory.set(cat, m);
    }
  }
  return { global, byCategory };
}

/** The multiple M1 uses for a protocol: its category's median, else the global median. */
export function compsMultiple(p: SnapshotProtocol, multiples: MarketMultiples): number {
  if (p.category !== null) {
    const m = multiples.byCategory.get(p.category);
    if (m !== undefined) return m;
  }
  return multiples.global;
}

/** The three sub-models and the ensemble value one protocol gets. */
export interface EnsembleScore {
  implied: number;
  m1: number;
  m2: number;
  m3: number;
  confidence: number;
  growthPct: number;
  growthAdj: number;
  seasoning: number;
  reach: number;
  momentum: number;
  stability: number;
  compsMultiple: number;
  age: number | null;
}

export function ensembleScore(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: MarketMultiples,
  w: EnsembleWeights = ENSEMBLE,
): EnsembleScore {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(w.growth_cap, Math.max(w.growth_floor, rawGrowth));
  // M2: growth adjusts the multiple; a decline counts at half rate, a rise at full rate.
  const growthAdj = 1 + (growthPct >= 0 ? growthPct / 100 : (growthPct / 100) * w.decline_half_rate);
  // M3, seasoning: a hump over age with no token. Rises to 1 at the peak, fades toward the floor
  // for the very old (age past seasoning_old_days) and the very young; unknown age is neutral 0.8.
  let seasoning: number;
  if (age === null) {
    seasoning = 0.8;
  } else if (age <= w.seasoning_peak_days) {
    seasoning = w.seasoning_floor + (1 - w.seasoning_floor) * (age / w.seasoning_peak_days);
  } else {
    const over = Math.min(1, (age - w.seasoning_peak_days) / Math.max(1, w.seasoning_old_days - w.seasoning_peak_days));
    seasoning = 1 - (1 - w.seasoning_floor) * over;
  }
  // M3, reach: each doubling of chain count adds a little; one chain is the baseline.
  const reach = 1 + w.reach_per_log_chain * Math.log(Math.max(1, protocol.chains.length));
  // M3, momentum: tanh-scaled 7d change, so a +200% week cannot double the value.
  const momentum = 1 + 0.35 * Math.tanh(growthPct / w.momentum_scale);
  // M3, stability: extreme weekly moves are discounted; calm protocols keep the full factor.
  const excess = Math.max(0, Math.abs(growthPct) - w.stability_cutoff);
  const stability = 1 - w.stability_max_penalty * Math.min(1, excess / 60);

  const cm = compsMultiple(protocol, multiples);
  const m1 = Math.max(1, protocol.tvl_usd * cm);
  const m2 = Math.max(1, protocol.tvl_usd * multiples.global * growthAdj);
  const m3 = Math.max(1, protocol.tvl_usd * multiples.global * seasoning * reach * momentum * stability);
  const logImplied = w.comps * Math.log(m1) + w.growth * Math.log(m2) + w.composite * Math.log(m3);
  const implied = Math.max(1, Math.round(Math.exp(logImplied)));
  // Confidence: the three sub-models' agreement in log space; 1 when they coincide.
  const logs = [Math.log(m1), Math.log(m2), Math.log(m3)];
  const mean = (logs[0]! + logs[1]! + logs[2]!) / 3;
  const sd = Math.sqrt(((logs[0]! - mean) ** 2 + (logs[1]! - mean) ** 2 + (logs[2]! - mean) ** 2) / 3);
  const confidence = Math.round(Math.max(0, Math.min(1, 1 - sd / 1.5)) * 100) / 100;
  return { implied, m1, m2, m3, confidence, growthPct, growthAdj, seasoning, reach, momentum, stability, compsMultiple: cm, age };
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, w: EnsembleWeights = ENSEMBLE): BoardRow[] {
  const multiples = marketMultiples(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped, held to the
  // watchlist's own exclusion rule. Never a replacement for a watchlist row: a chosen protocol
  // stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: ensembleScore(p, snapshot.as_of, multiples, w) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || b.s.confidence - a.s.confidence || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.s.age,
    implied_value_usd: s.s.implied,
    model: {
      version: MODEL_VERSION,
      comps_multiple: round4(s.s.compsMultiple),
      global_multiple: round4(multiples.global),
      m1_comps: s.s.m1,
      m2_growth: s.s.m2,
      m3_composite: s.s.m3,
      growth_pct: round4(s.s.growthPct),
      growth_adjustment: round4(s.s.growthAdj),
      seasoning: round4(s.s.seasoning),
      reach: round4(s.s.reach),
      momentum: round4(s.s.momentum),
      stability: round4(s.s.stability),
      confidence: s.s.confidence,
      weights: { comps: w.comps, growth: w.growth, composite: w.composite },
    },
    farm_steps: farmSteps(s.p, s.s.age, s.s).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 900) return 30;
  return 21;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open; borrow a small amount against it once, then repay it.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open; swap through the pool once a week.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('yield aggregator')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and keep the shares; claim and restake any rewards weekly.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app the same week.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, then close it the same week.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then settle it before the market closes.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares; check the vault's allocation each week.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the same wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it; record the mint transaction for the farm log.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy open for the full cover period.`;
  if (c.includes('liquid')) return `Deposit $${capital} into ${name}'s liquid market on ${chain} and keep the position open.`;
  if (c.includes('launchpad')) return `Stake $${capital} through ${name} on ${chain} to qualify for its launches and join one sale.`;
  if (c.includes('privacy')) return `Use $${capital} through ${name} on ${chain} for one private transaction a week, from the same wallet each time.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open; use the app once a week.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age, momentum), never from a hand-written list
 * of names. A fast-growing protocol gets tranched entries; a falling one gets a small first entry.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, s: EnsembleScore): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const entry =
    s.growthPct >= 20
      ? `Enter in two tranches of $${Math.round(capital / 2)} a week apart: the protocol's TVL is up ${Math.round(s.growthPct)}% in 7 days, so do not chase the whole position at once.`
      : s.growthPct <= -15
        ? `Start with half the position, $${Math.round(capital / 2)}: the protocol's TVL is down ${Math.round(Math.abs(s.growthPct))}% in 7 days, so scale in only if the next week steadies.`
        : action;
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: entry, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    second !== null
      ? {
          text: `Repeat the same position on ${second}, the protocol's second chain, so the activity shows on more than one chain.`,
          cost: `$${Math.round(capital / 2)} of capital and about $4 of gas`,
          time: '15 minutes',
        }
      : {
          text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, from the same wallet.`,
          cost: 'about $2 of gas a week',
          time: '10 minutes a week',
        },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, carrying the ensemble's parts for the model lab. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    m1_comps: row.model.m1_comps,
    m2_growth: row.model.m2_growth,
    m3_composite: row.model.m3_composite,
    confidence: row.model.confidence,
    comps_multiple: row.model.comps_multiple,
    seasoning: row.model.seasoning,
    reach: row.model.reach,
    momentum: row.model.momentum,
    stability: row.model.stability,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, w: EnsembleWeights = ENSEMBLE): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, w);
  const multiples = marketMultiples(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const catCounts = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== null) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);
  }
  const category_comps: CategoryComp[] = [...multiples.byCategory.entries()]
    .map(([category, median_multiple]) => ({ category, live_count: catCounts.get(category) ?? 0, median_multiple: round4(median_multiple) }))
    .sort((a, b) => b.live_count - a.live_count || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    ensemble: w,
    model_version: MODEL_VERSION,
    global_multiple: round4(multiples.global),
    category_comps,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
