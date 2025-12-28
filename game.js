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

/* --- GAME STATE --- */
const CELLS = 7;
let player = { pos: 1, hp: 5 };
let enemy  = { pos: 5, hp: 5 };
let busy = false;

const php = document.getElementById("php");
const ehp = document.getElementById("ehp");

/* --- INPUT --- */
document.querySelectorAll("#cards button").forEach(btn => {
  btn.addEventListener("click", () => {
    if (busy) return;
    turn(btn.dataset.card);
  });
});

/* --- TURN LOGIC --- */
function aiChoose() {
  const dist = Math.abs(enemy.pos - player.pos);
  if (dist === 1) {
    return Math.random() < 0.6 ? "throw" : "push";
  }
  return Math.random() < 0.5 ? "pull" : "push";
}

function turn(playerCard) {
  busy = true;
  const enemyCard = aiChoose();

  resolve(playerCard, enemyCard);

  php.textContent = player.hp;
  ehp.textContent = enemy.hp;

  setTimeout(() => {
    if (player.hp <= 0 || enemy.hp <= 0) reset();
    busy = false;
  }, 400);
}

function resolve(p, e) {
  // Throw
  if (p === "throw" && Math.abs(player.pos - enemy.pos) === 1) {
    enemy.hp -= 2;
    pushEnemy(player.pos < enemy.pos ? 1 : -1);
  }
  if (e === "throw" && Math.abs(player.pos - enemy.pos) === 1) {
    player.hp -= 2;
    pushPlayer(enemy.pos < player.pos ? 1 : -1);
  }

  // Push / Pull
  if (p === "push") pushEnemy(player.pos < enemy.pos ? 1 : -1);
  if (e === "push") pushPlayer(enemy.pos < player.pos ? 1 : -1);

  if (p === "pull") moveEnemy(player.pos < enemy.pos ? -1 : 1);
  if (e === "pull") movePlayer(enemy.pos < player.pos ? -1 : 1);
}

function pushEnemy(dir) {
  enemy.pos += dir;
  if (enemy.pos <= 0 || enemy.pos >= CELLS - 1) enemy.hp--;
  enemy.pos = clamp(enemy.pos);
}

function pushPlayer(dir) {
  player.pos += dir;
  if (player.pos <= 0 || player.pos >= CELLS - 1) player.hp--;
  player.pos = clamp(player.pos);
}

function moveEnemy(dir) {
  enemy.pos = clamp(enemy.pos + dir);
}

function movePlayer(dir) {
  player.pos = clamp(player.pos + dir);
}

function clamp(p) {
  return Math.max(0, Math.min(CELLS - 1, p));
}

function reset() {
  player = { pos: 1, hp: 5 };
  enemy  = { pos: 5, hp: 5 };
  php.textContent = 5;
  ehp.textContent = 5;
}

/* --- RENDER --- */
function draw() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  const midY = innerHeight * 0.5;
  const spacing = innerWidth / (CELLS + 1);

  // line
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(spacing, midY);
  ctx.lineTo(innerWidth - spacing, midY);
  ctx.stroke();

  // cells
  for (let i = 0; i < CELLS; i++) {
    const x = spacing * (i + 1);
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(x, midY, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // player
  drawFighter(player.pos, midY, spacing, "#4fd1c5");
  // enemy
  drawFighter(enemy.pos, midY, spacing, "#f56565");

  requestAnimationFrame(draw);
}

function drawFighter(pos, y, spacing, color) {
  const x = spacing * (pos + 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 20, 14, 0, Math.PI * 2);
  ctx.fill();
}

draw();
