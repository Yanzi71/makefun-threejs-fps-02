// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, bomb
// status, kill feed, buy menu, round banner and the overlay panels. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
// Every setter skips a DOM write when the value did not change.
import { WEAPONS, GRENADE_PRICE, ARMOUR_PRICE } from './weapons.js';

const OVERLAY_COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Round-based tactical FPS. Plant the bomb at Furnace or Silo — or wipe out the Raiders. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armourRow = $('armour-row');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const bombStatus = $('bomb-status');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerCopy = $('banner-copy');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const useBar = $('use-bar');
  const useFill = $('use-fill');
  const useLabel = $('use-label');
  const hint = $('hint');
  const vignette = $('damage-vignette');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(element, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  // Build the buy menu once from the weapon data: price, damage and key per item.
  const buyList = $('buy-list');
  const items = [
    ...Object.entries(WEAPONS).filter(([id]) => id !== 'pistol').map(([id, def], index) => ({ id, key: String(index + 1), name: def.name, price: def.price, detail: `${def.damage} dmg · ${def.mag} rounds` })),
    { id: 'grenade', key: '4', name: 'HE Charge', price: GRENADE_PRICE, detail: 'Throwable · G to throw' },
    { id: 'armour', key: '5', name: 'Kevlar Vest', price: ARMOUR_PRICE, detail: 'Absorbs 30% damage' },
  ];
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.id = item.id;
    button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-detail">${item.detail}</span><span class="buy-price">$${item.price}</span>`;
    button.addEventListener('click', () => callbacks.onBuy(item.id));
    buyList.appendChild(button);
  }

  function refreshBuyAffordability(money) {
    for (const button of buyList.children) {
      const item = items.find((entry) => entry.id === button.dataset.id);
      button.classList.toggle('cant-afford', money < item.price);
    }
  }

  return {
    setHealth(health) {
      setText(healthValue, 'health', String(health));
      const width = `${health}%`;
      if (last.healthWidth !== width) {
        last.healthWidth = width;
        healthFill.style.width = width;
        healthFill.classList.toggle('low', health <= 30);
      }
    },
    setArmour(armour) {
      const visible = armour > 0;
      if (last.armourVisible !== visible) {
        last.armourVisible = visible;
        armourRow.hidden = !visible;
      }
      if (visible) setText($('armour-value'), 'armour', String(armour));
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name, grenades) {
      setText(weaponName, 'weapon', name);
      setText(grenadeCount, 'grenades', grenades > 0 ? `G × ${grenades}` : '');
    },
    setMoney(money) {
      setText(moneyValue, 'money', `$${money}`);
      setText(buyMoney, 'buyMoney', `$${money}`);
      refreshBuyAffordability(money);
    },
    setTimer(seconds) {
      const total = Math.max(0, Math.ceil(seconds));
      const value = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', value);
      timerValue.classList.toggle('urgent', total <= 10);
    },
    setScore(wardens, raiders, round) {
      setText(scoreValue, 'score', `${wardens} — ${raiders}`);
      setText(roundValue, 'round', `ROUND ${round}`);
    },
    setBombStatus(text, urgent) {
      setText(bombStatus, 'bomb', text);
      bombStatus.classList.toggle('urgent', Boolean(urgent));
    },
    addKill(killer, victim, headshot, byPlayer) {
      const entry = document.createElement('div');
      entry.className = 'kill-entry';
      entry.innerHTML = `<span class="${byPlayer ? 'killer-you' : 'killer'}">${killer}</span> ${headshot ? '◉' : '✕'} <span class="victim">${victim}</span>`;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => entry.remove(), 5000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    setCrosshairSpread(spread) {
      const gap = Math.round(4 + spread * 260);
      if (last.gap === gap) return;
      last.gap = gap;
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    flashDamage() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 220);
    },
    setUseProgress(label, progress) {
      if (progress === null) {
        useBar.hidden = true;
        return;
      }
      useBar.hidden = false;
      setText(useLabel, 'useLabel', label);
      useFill.style.width = `${Math.round(progress * 100)}%`;
    },
    setHint(text) {
      setText(hint, 'hint', text);
    },
    showBanner(title, copy) {
      bannerTitle.textContent = title;
      bannerCopy.textContent = copy;
      banner.hidden = false;
      clearTimeout(bannerTimer);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showBuyMenu() {
      buyMenu.hidden = false;
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    buyMenuOpen() {
      return !buyMenu.hidden;
    },
    showOverlay(mode, scoreText) {
      const text = OVERLAY_COPY[mode];
      overlayTitle.textContent = text.title;
      overlayCopy.textContent = mode === 'start' && scoreText ? `${text.copy} ${scoreText}` : text.copy;
      playButton.textContent = text.action;
      overlay.hidden = false;
      playButton.focus();
    },
    showMatchEnd(won, scoreText) {
      overlayTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
      overlayCopy.textContent = `Final score ${scoreText}. The yard is yours to retake.`;
      playButton.textContent = 'Play again';
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
  };
}
