const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

/* --- UI refs --- */
const php = document.getElementById("php");
const ehp = document.getElementById("ehp");
const phaseEl = document.getElementById("phase");
const timerEl = document.getElementById("timer");
const turnNoEl = document.getElementById("turnNo");
const logEl = document.getElementById("log");
const pPickEl = document.getElementById("pPick");
const ePickEl = document.getElementById("ePick");
const cardButtons = [...document.querySelectorAll("#cards button")];

const CARD = {
  push: { tr: "İt" },
  pull: { tr: "Çek" },
  throw: { tr: "At" }
};

/* --- GAME STATE --- */
const CELLS = 7;
let player, enemy;

let phase = "PICK";      // PICK -> RESOLVE -> (next PICK)
let busy = false;

let turnNo = 1;
let pickTime = 8.0;      // saniye
let timeLeft = pickTime;
let lastT = 0;

function reset() {
  player = { pos: 1, hp: 5 };
  enemy  = { pos: 5, hp: 5 };

  turnNo = 1;
  timeLeft = pickTime;
  phase = "PICK";
  busy = false;

  pPickEl.textContent = "—";
  ePickEl.textContent = "—";
  setPhaseText("Kart seç");
  setLog("Kart seçerek başla. (İt / Çek / At)");
  syncHp();
  setCardsEnabled(true);
}
reset();

/* --- INPUT --- */
cardButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if (busy || phase !== "PICK") return;
    const c = btn.dataset.card;
    doTurn(c);
  });
});

/* --- PHASE UI --- */
function setPhaseText(t) { phaseEl.textContent = t; }
function setLog(t) { logEl.textContent = t; }
function syncHp() {
  php.textContent = player.hp;
  ehp.textContent = enemy.hp;
  turnNoEl.textContent = String(turnNo);
}

function setCardsEnabled(on) {
  cardButtons.forEach(b => b.disabled = !on);
}

/* --- AI --- */
function aiChoose() {
  const dist = Math.abs(enemy.pos - player.pos);
  if (dist === 1) {
    // bitişik: at daha olası
    const r = Math.random();
    if (r < 0.60) return "throw";
    if (r < 0.85) return "push";
    return "pull";
  } else {
    // uzak: çek ile yaklaştırmayı sever
    return Math.random() < 0.55 ? "pull" : "push";
  }
}

/* --- TURN --- */
function doTurn(playerCard) {
  busy = true;
  phase = "RESOLVE";
  setCardsEnabled(false);
  setPhaseText("Çözülüyor…");

  const enemyCard = aiChoose();

  pPickEl.textContent = CARD[playerCard].tr;
  ePickEl.textContent = "Gizli"; // önce gizleyelim

  // çözümle
  const result = resolve(playerCard, enemyCard);

  // rakibi sonra göster (anlaşılır his)
  setTimeout(() => { ePickEl.textContent = CARD[enemyCard].tr; }, 250);

  // log'u yaz
  setLog(result.log);
  syncHp();

  // tur biterken
  setTimeout(() => {
    if (player.hp <= 0 || enemy.hp <= 0) {
      const win = enemy.hp <= 0 && player.hp > 0;
      setPhaseText(win ? "Kazandın!" : "Kaybettin!");
      setLog(win ? "Rakibi yendin. Yeni oyun başlıyor…" : "Yenildin. Yeni oyun başlıyor…");
      setTimeout(reset, 900);
      return;
    }

    turnNo++;
    timeLeft = pickTime;
    phase = "PICK";
    busy = false;
    pPickEl.textContent = "—";
    ePickEl.textContent = "—";
    setPhaseText("Kart seç");
    setCardsEnabled(true);
  }, 600);
}

/* --- RULES --- */
function resolve(p, e) {
  const dist = Math.abs(player.pos - enemy.pos);
  let logParts = [];

  // Atışlar (bitişikse)
  if (p === "throw") {
    if (dist === 1) {
      enemy.hp -= 2;
      pushEnemy(player.pos < enemy.pos ? 1 : -1);
      logParts.push("Sen **At** yaptın: +2 hasar.");
    } else {
      logParts.push("Sen **At** denedin ama bitişik değildin.");
    }
  }

  if (e === "throw") {
    if (dist === 1) {
      player.hp -= 2;
      pushPlayer(enemy.pos < player.pos ? 1 : -1);
      logParts.push("Rakip **At** yaptı: +2 hasar aldın.");
    } else {
      logParts.push("Rakip **At** denedi ama bitişik değildi.");
    }
  }

  // İtme
  if (p === "push") { pushEnemy(player.pos < enemy.pos ? 1 : -1); logParts.push("Sen **İt** yaptın."); }
  if (e === "push") { pushPlayer(enemy.pos < player.pos ? 1 : -1); logParts.push("Rakip **İt** yaptı."); }

  // Çekme
  if (p === "pull") { moveEnemy(player.pos < enemy.pos ? -1 : 1); logParts.push("Sen **Çek** yaptın."); }
  if (e === "pull") { movePlayer(enemy.pos < player.pos ? -1 : 1); logParts.push("Rakip **Çek** yaptı."); }

  // duvar hasarı log’ları
  if (lastWallHitEnemy) logParts.push("Rakip duvara çarptı: +1 hasar.");
  if (lastWallHitPlayer) logParts.push("Sen duvara çarptın: +1 hasar.");

  // sıfırla
  const res = { log: logParts.join(" ") };
  lastWallHitEnemy = false;
  lastWallHitPlayer = false;
  return res;
}

let lastWallHitEnemy = false;
let lastWallHitPlayer = false;

function pushEnemy(dir) {
  enemy.pos += dir;
  if (enemy.pos <= 0 || enemy.pos >= CELLS - 1) { enemy.hp--; lastWallHitEnemy = true; }
  enemy.pos = clamp(enemy.pos);
}

function pushPlayer(dir) {
  player.pos += dir;
  if (player.pos <= 0 || player.pos >= CELLS - 1) { player.hp--; lastWallHitPlayer = true; }
  player.pos = clamp(player.pos);
}

function moveEnemy(dir) { enemy.pos = clamp(enemy.pos + dir); }
function movePlayer(dir) { player.pos = clamp(player.pos + dir); }

function clamp(p) { return Math.max(0, Math.min(CELLS - 1, p)); }

/* --- TIMER LOOP --- */
function tick(t) {
  if (!lastT) lastT = t;
  const dt = (t - lastT) / 1000;
  lastT = t;

  if (phase === "PICK" && !busy) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      // süre bitti: otomatik kart seç (oyun akmasın diye)
      doTurn(autoPick());
    }
  }

  timerEl.textContent = timeLeft.toFixed(1);

  draw();
  requestAnimationFrame(tick);
}

function autoPick() {
  // basit: rastgele ama "At" biraz daha az
  const r = Math.random();
  if (r < 0.40) return "push";
  if (r < 0.80) return "pull";
  return "throw";
}

/* --- RENDER --- */
function draw() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  const midY = innerHeight * 0.48;
  const spacing = innerWidth / (CELLS + 1);

  // hat
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(spacing, midY);
  ctx.lineTo(innerWidth - spacing, midY);
  ctx.stroke();

  // uçlar (duvar)
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(spacing - 10, midY - 26, 20, 52);
  ctx.fillRect(innerWidth - spacing - 10, midY - 26, 20, 52);

  // hücreler
  for (let i = 0; i < CELLS; i++) {
    const x = spacing * (i + 1);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(x, midY, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // oyuncular
  drawFighter(player.pos, midY, spacing, "rgba(79,209,197,0.95)", "SEN");
  drawFighter(enemy.pos, midY, spacing, "rgba(245,101,101,0.95)", "RAKİP");
}

function drawFighter(pos, y, spacing, color, label) {
  const x = spacing * (pos + 1);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 22, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 12);
  ctx.textAlign = "start";
}

requestAnimationFrame(tick);
