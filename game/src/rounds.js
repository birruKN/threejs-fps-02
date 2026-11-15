// The match: rounds, phases, economy. First to 5 round wins takes the match
// (9 rounds max). Buy phase 15 s, live round 100 s. Win +$3,250, loss +$1,900
// with a +$500 streak bonus per consecutive loss (capped at +$3,400), kill +$300.
import { BUY_ITEMS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createMatch() {
  const state = {
    round: 1,
    scoreV: 0,
    scoreJ: 0,
    phase: 'buy', // buy | live | end | match
    timer: BUY_TIME,
    money: 800,
    lossStreak: 0,
    kills: 0,
    roundKills: 0,
    winner: null, // 'vanguard' | 'jackal' | 'draw'
    reason: '',
  };

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_TIME;
    state.roundKills = 0;
    state.winner = null;
    state.reason = '';
  }

  function beginLive() {
    state.phase = 'live';
    state.timer = ROUND_TIME;
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return false;
    state.phase = 'end';
    state.winner = winner;
    state.reason = reason;
    state.timer = 6;
    if (winner === 'vanguard') {
      state.scoreV += 1;
      state.money += 3250;
      state.lossStreak = 0;
    } else {
      state.scoreJ += 1;
      state.money += Math.min(3400, 1900 + state.lossStreak * 500);
      state.lossStreak += 1;
    }
    return true;
  }

  function endMatchIfDecided() {
    if (state.scoreV >= WIN_ROUNDS || state.scoreJ >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'match';
      state.winner = state.scoreV > state.scoreJ ? 'vanguard' : state.scoreJ > state.scoreV ? 'jackal' : 'draw';
      return true;
    }
    return false;
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function addKillReward() {
    state.money += 300;
    state.kills += 1;
    state.roundKills += 1;
  }

  function buyPrice(id) {
    if (id === 'grenade') return GRENADE_PRICE;
    if (id === 'armor') return ARMOR_PRICE;
    const item = BUY_ITEMS.find((b) => b.id === id);
    return item ? item.price : 0;
  }

  // Returns true when the purchase went through.
  function buy(id) {
    const price = buyPrice(id);
    if (price <= 0 || state.money < price) return false;
    state.money -= price;
    return true;
  }

  function step(dt) {
    if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'end') {
      state.timer -= dt;
    }
  }

  return { state, startRound, beginLive, endRound, endMatchIfDecided, nextRound, addKillReward, buy, buyPrice, step };
}
