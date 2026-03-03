// ===== Telegram init (не обязателен) =====
try {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.expand();
    tg.ready();
  }
} catch (_) {}

// ===== Конфиг слота =====
const REELS = 5;
const ROWS = 3;

// Paylines (5 линий)
const PAYLINES = [
  // top row
  [{r:0,c:0},{r:0,c:1},{r:0,c:2},{r:0,c:3},{r:0,c:4}],
  // mid row
  [{r:1,c:0},{r:1,c:1},{r:1,c:2},{r:1,c:3},{r:1,c:4}],
  // bottom row
  [{r:2,c:0},{r:2,c:1},{r:2,c:2},{r:2,c:3},{r:2,c:4}],
  // V
  [{r:0,c:0},{r:1,c:1},{r:2,c:2},{r:1,c:3},{r:0,c:4}],
  // ^ (inverted V)
  [{r:2,c:0},{r:1,c:1},{r:0,c:2},{r:1,c:3},{r:2,c:4}],
];

// Символы
const SYMBOLS = {
  W:  { id:"W",  label:"WILD", icon:"🌀", type:"wild" },
  H:  { id:"H",  label:"BONUS", icon:"🏠", type:"scatter" },
  M2: { id:"M2", label:"2×",   icon:"2×", type:"mult", mult:2 },
  M3: { id:"M3", label:"3×",   icon:"3×", type:"mult", mult:3 },

  C:  { id:"C",  label:"Candy", icon:"🍬", type:"pay", pay:{3:0.40,4:1.00,5:2.50} },
  L:  { id:"L",  label:"Lolli", icon:"🍭", type:"pay", pay:{3:0.30,4:0.80,5:2.00} },
  P:  { id:"P",  label:"Ice",   icon:"🍡", type:"pay", pay:{3:0.25,4:0.60,5:1.50} },

  A:  { id:"A",  label:"A", icon:"A", type:"pay", pay:{3:0.20,4:0.50,5:1.20} },
  K:  { id:"K",  label:"K", icon:"K", type:"pay", pay:{3:0.20,4:0.50,5:1.20} },
  Q:  { id:"Q",  label:"Q", icon:"Q", type:"pay", pay:{3:0.15,4:0.40,5:1.00} },
  J:  { id:"J",  label:"J", icon:"J", type:"pay", pay:{3:0.15,4:0.40,5:1.00} },
  _10:{ id:"10", label:"10",icon:"10",type:"pay", pay:{3:0.10,4:0.30,5:0.80} },
  _9: { id:"9",  label:"9", icon:"9", type:"pay", pay:{3:0.10,4:0.30,5:0.80} },
};

// Веса (частоты) — это и есть “математика”
// Домик (H) будет добавлен ТОЛЬКО на барабаны 1,2,5
// Иксы (M2/M3) будут добавлены ТОЛЬКО на барабаны 2,3,4
const BASE_WEIGHTS = {
  C: 3, L: 4, P: 5,
  A: 8, K: 8, Q: 10, J: 10, _10: 12, _9: 12,
  W: 1,
  H: 0, M2: 0, M3: 0,
};

// Усиление бонуски (чуть чаще W и множители)
const BONUS_BOOST = {
  W: 1.6, // увеличиваем вероятность Wild в FS
  M2: 1.4,
  M3: 1.2,
};

// Ограничение на множитель, чтобы “не сильно заносило”
const MAX_TOTAL_MULT = 12;

// Цена покупки бонуски
function bonusBuyPrice(bet){
  // можно менять: чем выше, тем “честнее”
  return bet * 50;
}

// ===== State =====
const state = {
  balance: loadNumber("balance", 10000),
  bet: loadNumber("bet", 100),
  freeSpins: loadNumber("freeSpins", 0),
  auto: false,
  spinning: false,
  lastWin: 0,
};

const el = {
  slot: document.getElementById("slot"),
  balance: document.getElementById("balance"),
  bet: document.getElementById("bet"),
  fs: document.getElementById("fs"),
  lastWin: document.getElementById("lastWin"),
  note: document.getElementById("note"),
  spin: document.getElementById("spin"),
  betMinus: document.getElementById("betMinus"),
  betPlus: document.getElementById("betPlus"),
  auto: document.getElementById("auto"),
  buyBonus: document.getElementById("buyBonus"),
};

// ===== UI build =====
let cellEls = []; // [row][col] -> div

function buildGrid(){
  el.slot.innerHTML = "";
  cellEls = Array.from({length: ROWS}, ()=>Array(REELS).fill(null));

  for(let c=0;c<REELS;c++){
    const reel = document.createElement("div");
    reel.className = "reel";
    reel.dataset.reel = c;

    for(let r=0;r<ROWS;r++){
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;

      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = "";
      cell.appendChild(sub);

      reel.appendChild(cell);
      cellEls[r][c] = cell;
    }
    el.slot.appendChild(reel);
  }
}

function renderHud(msg=""){
  el.balance.textContent = Math.floor(state.balance);
  el.bet.textContent = state.bet;
  el.fs.textContent = state.freeSpins;
  el.lastWin.textContent = state.lastWin;
  el.note.textContent = msg;

  saveNumber("balance", state.balance);
  saveNumber("bet", state.bet);
  saveNumber("freeSpins", state.freeSpins);

  el.auto.textContent = `AUTO: ${state.auto ? "ON" : "OFF"}`;
}

function setCell(r,c,symId, extraLabel=""){
  const s = SYMBOLS[symId];
  const cell = cellEls[r][c];
  cell.classList.toggle("wild", s.type === "wild");
  cell.classList.remove("win");
  cell.firstChild.nodeValue = ""; // not used
  cell.childNodes.forEach(n => { /* keep sub */ });

  // Put main text
  cell.style.fontSize = (s.icon.length > 2 ? "22px" : "28px");
  cell.innerHTML = `<span class="main">${s.icon}</span><div class="sub">${extraLabel || s.label}</div>`;
  cell.classList.toggle("wild", s.type === "wild");
}

function clearWins(){
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<REELS;c++){
      cellEls[r][c].classList.remove("win");
    }
  }
}

// ===== RNG helpers =====
function weightedPick(entries){
  // entries: [{id, w}]
  const total = entries.reduce((a,e)=>a+e.w, 0);
  let x = Math.random() * total;
  for(const e of entries){
    x -= e.w;
    if(x <= 0) return e.id;
  }
  return entries[entries.length-1].id;
}

function getWeightsForReel(reelIndex, inFreeSpins){
  // reelIndex: 0..4
  const w = {...BASE_WEIGHTS};

  // Домики только на барабанах 1,2,5 => index 0,1,4
  if([0,1,4].includes(reelIndex)) w.H = 0.9; else w.H = 0;

  // Иксы только на барабанах 2,3,4 => index 1,2,3
  if([1,2,3].includes(reelIndex)){
    w.M2 = 0.9;
    w.M3 = 0.45;
  } else {
    w.M2 = 0; w.M3 = 0;
  }

  // В FS слегка бустим W и мульты
  if(inFreeSpins){
    w.W *= BONUS_BOOST.W;
    w.M2 *= BONUS_BOOST.M2;
    w.M3 *= BONUS_BOOST.M3;
  }

  // Собираем список
  const list = [];
  for(const [id, ww] of Object.entries(w)){
    if(ww > 0) list.push({id, w: ww});
  }
  return list;
}

function generateMatrix(inFreeSpins){
  // matrix[r][c] = symbolId
  const m = Array.from({length: ROWS}, ()=>Array(REELS).fill(null));
  for(let c=0;c<REELS;c++){
    const weights = getWeightsForReel(c, inFreeSpins);
    for(let r=0;r<ROWS;r++){
      m[r][c] = weightedPick(weights);
    }
  }
  return m;
}

// ===== Win calculation =====
function isSubstitutable(symId){
  const t = SYMBOLS[symId].type;
  return t === "pay" || t === "wild";
}

function calcLineWin(line, matrix, bet){
  // line: [{r,c}...]
  // pays left-to-right, 3+ match, wild substitutes
  const ids = line.map(p => matrix[p.r][p.c]);

  // if first symbols are wild, find first non-wild pay symbol
  let base = null;
  for(const id of ids){
    const s = SYMBOLS[id];
    if(s.type === "pay") { base = id; break; }
    if(s.type !== "wild") break; // scatter/mult breaks base
  }
  if(!base) return {win:0, count:0, sym:null, coords:[]};

  let count = 0;
  const coords = [];
  for(const p of line){
    const id = matrix[p.r][p.c];
    const s = SYMBOLS[id];

    if(s.type === "scatter" || s.type === "mult") break;
    if(id === base || s.type === "wild"){
      count++;
      coords.push(p);
    } else {
      break;
    }
  }

  if(count < 3) return {win:0, count, sym:base, coords:[]};

  const pay = SYMBOLS[base].pay?.[count] ?? 0;
  return {win: bet * pay, count, sym: base, coords};
}

function calcSpinWin(matrix, bet){
  let total = 0;
  const winCoords = [];

  // line wins
  for(const line of PAYLINES){
    const res = calcLineWin(line, matrix, bet);
    if(res.win > 0){
      total += res.win;
      winCoords.push(...res.coords.map(p => `${p.r}:${p.c}`));
    }
  }

  // multipliers anywhere in matrix
  let mult = 1;
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<REELS;c++){
      const s = SYMBOLS[matrix[r][c]];
      if(s.type === "mult"){
        mult *= s.mult;
      }
    }
  }
  if(mult > MAX_TOTAL_MULT) mult = MAX_TOTAL_MULT;

  total *= mult;

  // bonus trigger: 3+ houses anywhere (они и так только на 1,2,5 барабанах)
  let houses = 0;
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<REELS;c++){
      if(matrix[r][c] === "H") houses++;
    }
  }

  return {
    win: Math.floor(total),
    mult,
    houses,
    winCoords: Array.from(new Set(winCoords)),
  };
}

// ===== Animation =====
function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

async function animateSpin(finalMatrix, inFreeSpins){
  // reel-by-reel stopping
  clearWins();

  // quick random flicker
  const start = Date.now();
  const reelStop = Array.from({length: REELS}, (_,i)=> 650 + i*170);

  // While not all stopped, update
  let stopped = Array(REELS).fill(false);

  while(true){
    const t = Date.now() - start;

    for(let c=0;c<REELS;c++){
      if(stopped[c]) continue;

      const shouldStop = t >= reelStop[c];
      if(shouldStop){
        stopped[c] = true;
        // set final for this reel
        for(let r=0;r<ROWS;r++){
          setCell(r,c, finalMatrix[r][c]);
        }
      } else {
        // set random symbols during spin
        const weights = getWeightsForReel(c, inFreeSpins);
        for(let r=0;r<ROWS;r++){
          const rnd = weightedPick(weights);
          setCell(r,c, rnd, ""); // no label during flicker
        }
      }
    }

    if(stopped.every(Boolean)) break;
    await sleep(55);
  }
}

// ===== Game loop =====
function canSpin(){
  if(state.spinning) return false;
  if(state.freeSpins > 0) return true;
  return state.balance >= state.bet;
}

async function doSpin(){
  if(!canSpin()) return;

  state.spinning = true;
  el.spin.disabled = true;
  el.betMinus.disabled = true;
  el.betPlus.disabled = true;
  el.buyBonus.disabled = true;

  const inFree = state.freeSpins > 0;

  if(inFree){
    state.freeSpins -= 1;
  } else {
    state.balance -= state.bet;
  }

  renderHud(inFree ? "Free Spin..." : "Spinning...");

  const matrix = generateMatrix(inFree);
  await animateSpin(matrix, inFree);

  const res = calcSpinWin(matrix, state.bet);

  // начисление выигрыша
  state.lastWin = res.win;
  state.balance += res.win;

  // бонуска (только если не FS, чтобы не зацикливать)
  if(!inFree && res.houses >= 3){
    state.freeSpins += 10;
    renderHud(`БОНУСКА! Выпало домиков: ${res.houses}. +10 FS`);
  } else {
    const msg = res.win > 0
      ? `Выигрыш: ${res.win} (множитель спина: x${res.mult})`
      : `Нет выигрыша (множитель спина: x${res.mult})`;
    renderHud(msg);
  }

  // подсветить выигрышные клетки
  for(const key of res.winCoords){
    const [r,c] = key.split(":").map(Number);
    cellEls[r][c].classList.add("win");
  }

  state.spinning = false;
  el.spin.disabled = false;
  el.betMinus.disabled = false;
  el.betPlus.disabled = false;
  el.buyBonus.disabled = false;

  // AUTO
  if(state.auto){
    await sleep(250);
    if(state.auto && canSpin()) doSpin();
    else renderHud();
  }
}

function buyBonus(){
  if(state.spinning) return;
  if(state.freeSpins > 0) return; // чтобы не покупать в активной бонуске

  const price = bonusBuyPrice(state.bet);
  if(state.balance < price){
    renderHud(`Не хватает на покупку бонуски. Нужно: ${price}`);
    return;
  }

  state.balance -= price;
  state.freeSpins += 10;
  state.lastWin = 0;
  renderHud(`Куплена бонуска за ${price}. +10 FS`);
}

// ===== Controls =====
el.spin.addEventListener("click", doSpin);

el.betMinus.addEventListener("click", ()=>{
  if(state.spinning) return;
  state.bet = Math.max(10, state.bet - 10);
  renderHud();
});

el.betPlus.addEventListener("click", ()=>{
  if(state.spinning) return;
  state.bet = Math.min(1000, state.bet + 10);
  renderHud();
});

el.auto.addEventListener("click", async ()=>{
  state.auto = !state.auto;
  renderHud();
  if(state.auto && canSpin()) doSpin();
});

el.buyBonus.addEventListener("click", buyBonus);

// ===== Storage =====
function loadNumber(key, def){
  const v = localStorage.getItem("slot_" + key);
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function saveNumber(key, val){
  localStorage.setItem("slot_" + key, String(Math.floor(val)));
}

// ===== Init =====
buildGrid();
// стартовое заполнение
const startM = generateMatrix(false);
for(let r=0;r<ROWS;r++){
  for(let c=0;c<REELS;c++){
    setCell(r,c, startM[r][c]);
  }
}
renderHud("Готово. Нажми SPIN.");
