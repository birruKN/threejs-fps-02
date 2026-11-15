// HUD: every DOM read/write lives here. The simulation never touches the
// DOM; main.js calls these setters once per frame (or on events).
import { BUY_ITEMS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthNum: $('health-num'),
    healthBar: $('health-bar'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammo: $('ammo'),
    money: $('money'),
    timer: $('timer'),
    score: $('score'),
    roundLabel: $('round-label'),
    bombBanner: $('bomb-banner'),
    killfeed: $('killfeed'),
    vignette: $('damage-vignette'),
    hint: $('hint'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    buyMenu: $('buy-menu'),
    buyItems: $('buy-items'),
    buyMoney: $('buy-money'),
    spectate: $('spectate'),
    weaponName: $('weapon-name'),
  };

  let hitTimer = null;
  let vignetteTimer = null;

  function buildBuy() {
    const items = [...BUY_ITEMS, { id: 'armor', label: 'KEVLAR VEST', price: ARMOR_PRICE, desc: 'Absorbs half of incoming damage' }];
    els.buyItems.innerHTML = items.map((item) => (
      `<button type="button" class="buy-item" data-item="${item.id}">
        <span class="buy-key">${item.id === 'rifle' ? '1' : item.id === 'smg' ? '2' : item.id === 'grenade' ? '3' : '4'}</span>
        <span class="buy-name">${item.label}</span>
        <span class="buy-desc">${item.desc}</span>
        <span class="buy-price">$${item.price}</span>
      </button>`
    )).join('');
  }
  buildBuy();

  function setHealth(hp) {
    els.healthNum.textContent = Math.ceil(hp);
    els.healthBar.style.width = `${Math.max(0, hp)}%`;
    els.healthBar.classList.toggle('low', hp <= 30);
  }

  function setArmor(armor) {
    els.armorNum.textContent = Math.ceil(armor);
  }

  function setAmmo(mag, reserve, reloading) {
    els.ammoMag.textContent = reloading ? '--' : mag;
    els.ammoReserve.textContent = `/ ${reserve}`;
    els.ammo.classList.toggle('empty', mag === 0 && !reloading);
  }

  function setWeaponName(name) {
    els.weaponName.textContent = name;
  }

  function setMoney(money) {
    els.money.textContent = `$${money}`;
    els.buyMoney.textContent = `$${money}`;
  }

  function setTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    els.timer.classList.toggle('urgent', s <= 10);
  }

  function setScore(v, j) {
    els.score.innerHTML = `<b class="team-v">VANGUARD ${v}</b> — <b class="team-j">${j} JACKALS</b>`;
  }

  function setRound(round) {
    els.roundLabel.textContent = `ROUND ${round}`;
  }

  function setBombStatus(text, kind) {
    if (!text) {
      els.bombBanner.hidden = true;
      return;
    }
    els.bombBanner.hidden = false;
    els.bombBanner.textContent = text;
    els.bombBanner.className = `bomb-${kind || 'info'}`;
  }

  function crosshairGap(spread) {
    // Spread in radians -> pixel gap on screen.
    const px = 4 + Math.min(26, spread * 900);
    els.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
  }

  function hitmarker(kill) {
    els.hitmarker.classList.add('on');
    els.hitmarker.classList.toggle('kill', !!kill);
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), 140);
  }

  function addKill(killer, victim, headshot, killerIsPlayer, victimIsPlayer) {
    const line = document.createElement('div');
    line.className = 'kill-line';
    line.innerHTML = `<span class="${killerIsPlayer ? 'team-v' : 'team-j'}">${killer}</span> `
      + `<span class="kill-weapon">${headshot ? '◎' : '×'}</span> `
      + `<span class="${victimIsPlayer ? 'team-v' : 'team-j'}">${victim}</span>`;
    els.killfeed.prepend(line);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    setTimeout(() => line.remove(), 6000);
  }

  function damageFlash() {
    els.vignette.classList.add('on');
    if (vignetteTimer) clearTimeout(vignetteTimer);
    vignetteTimer = setTimeout(() => els.vignette.classList.remove('on'), 220);
  }

  function setHint(text) {
    els.hint.textContent = text || '';
    els.hint.hidden = !text;
  }

  function setPlantProgress(label, frac) {
    if (frac === null) {
      els.plantBar.hidden = true;
      return;
    }
    els.plantBar.hidden = false;
    els.plantLabel.textContent = label;
    els.plantFill.style.width = `${Math.round(frac * 100)}%`;
  }

  function setSpectate(name) {
    els.spectate.hidden = !name;
    if (name) els.spectate.textContent = `SPECTATING ${name}`;
  }

  function showOverlay(kind, data) {
    const o = els.overlay;
    o.hidden = false;
    const titles = {
      start: ['EMBER YARD', 'A dusk freight yard. Hold both sites, stop the plant — or defuse what gets through. First to 5 rounds takes the match.'],
      paused: ['PAUSED', 'Click to keep playing.'],
      round: [data.winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST', data.reason],
      match: [data.winner === 'vanguard' ? 'MATCH WON' : data.winner === 'draw' ? 'DRAW' : 'MATCH LOST', `Final score Vanguard ${data.scoreV} — ${data.scoreJ} Jackals.`],
      dead: ['YOU ARE DOWN', 'Spectating a teammate. The round plays on.'],
    };
    const [title, copy] = titles[kind] || titles.start;
    els.overlayTitle.textContent = title;
    els.overlayCopy.textContent = copy;
    els.play.textContent = kind === 'match' ? 'PLAY AGAIN' : kind === 'start' ? 'CLICK TO PLAY' : kind === 'dead' ? 'SPECTATE' : 'CONTINUE';
    els.play.dataset.kind = kind;
  }

  function hideOverlay() { els.overlay.hidden = true; }

  function showBuy(show, money, owned) {
    els.buyMenu.hidden = !show;
    setMoney(money);
    for (const button of els.buyItems.querySelectorAll('.buy-item')) {
      const id = button.dataset.item;
      const price = id === 'armor' ? ARMOR_PRICE : id === 'grenade' ? GRENADE_PRICE
        : BUY_ITEMS.find((b) => b.id === id).price;
      button.classList.toggle('cant', money < price);
      button.classList.toggle('owned', !!owned[id]);
    }
  }

  function onPlay(handler) { els.play.addEventListener('click', handler); }
  function onBuyClick(handler) {
    els.buyItems.addEventListener('click', (event) => {
      const button = event.target.closest('.buy-item');
      if (button) handler(button.dataset.item);
    });
  }

  return {
    setHealth, setArmor, setAmmo, setWeaponName, setMoney, setTimer, setScore,
    setRound, setBombStatus, crosshairGap, hitmarker, addKill, damageFlash,
    setHint, setPlantProgress, setSpectate, showOverlay, hideOverlay, showBuy,
    onPlay, onBuyClick,
  };
}
