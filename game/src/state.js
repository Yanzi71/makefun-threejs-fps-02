// The match state, in one place: phase, round, score, money and timers. main.js
// reads it every step and drives the transitions; nothing else mutates it.
// First to 5 rounds wins the match (at most 9 rounds). Money follows the
// Counter-Strike shape: a kill pays $300, a round win $3,250, a loss $1,400 plus
// $500 per consecutive loss, capped at $2,900.
export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const ROUND_END_TIME = 4;
export const WIN_TARGET = 5;
export const MAX_ROUNDS = 9;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1400;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_REWARD_MAX = 2900;
export const START_MONEY = 800;

export function createState() {
  const state = {
    phase: PHASE.MENU,
    round: 1,
    score: { wardens: 0, raiders: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    lossStreak: 0,
    timeLeft: 0,
    roundEndLeft: 0,
    roundEndReason: '',
    roundWinner: null,
    matchWinner: null,
  };

  return {
    state,
    startMatch() {
      state.phase = PHASE.BUY;
      state.round = 1;
      state.score.wardens = 0;
      state.score.raiders = 0;
      state.money = START_MONEY;
      state.kills = 0;
      state.deaths = 0;
      state.lossStreak = 0;
      state.timeLeft = BUY_TIME;
      state.roundWinner = null;
      state.matchWinner = null;
    },
    startRound() {
      state.phase = PHASE.BUY;
      state.timeLeft = BUY_TIME;
      state.roundWinner = null;
    },
    beginLive() {
      state.phase = PHASE.LIVE;
      state.timeLeft = ROUND_TIME;
    },
    addKillReward() {
      state.money += KILL_REWARD;
      state.kills += 1;
    },
    addDeath() {
      state.deaths += 1;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    endRound(winner, reason) {
      state.phase = PHASE.ROUND_END;
      state.roundWinner = winner;
      state.roundEndReason = reason;
      state.roundEndLeft = ROUND_END_TIME;
      state.score[winner] += 1;
      if (winner === 'wardens') {
        state.money += WIN_REWARD;
        state.lossStreak = 0;
      } else {
        state.money += Math.min(LOSS_REWARD_MAX, LOSS_REWARD + state.lossStreak * LOSS_STREAK_BONUS);
        state.lossStreak += 1;
      }
    },
    nextRound() {
      state.round += 1;
      if (state.score.wardens >= WIN_TARGET || state.score.raiders >= WIN_TARGET || state.round > MAX_ROUNDS) {
        state.phase = PHASE.MATCH_END;
        state.matchWinner = state.score.wardens === state.score.raiders ? 'draw' : state.score.wardens > state.score.raiders ? 'wardens' : 'raiders';
        return false;
      }
      this.startRound();
      return true;
    },
  };
}
