const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "r") reset();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let player, lastT;

function reset() {
  player = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5,
    r: 14,
    vx: 0,
    vy: 0
  };
}
reset();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function update(dt) {
  const accel = 2200;
  const damping = 12;
  let ax = 0, ay = 0;

  if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
  if (keys.has("d") || keys.has("arrowright")) ax += 1;
  if (keys.has("w") || keys.has("arrowup")) ay -= 1;
  if (keys.has("s") || keys.has("arrowdown")) ay += 1;

  const mag = Math.hypot(ax, ay);
  if (mag > 0) { ax /= mag; ay /= mag; }

  player.vx += ax * accel * dt;
  player.vy += ay * accel * dt;

  player.vx *= Math.exp(-damping * dt);
  player.vy *= Math.exp(-damping * dt);

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const w = window.innerWidth, h = window.innerHeight;
  player.x = clamp(player.x, player.r, w - player.r);
  player.y = clamp(player.y, player.r, h - player.r);
}

function draw() {
  const w = window.innerWidth, h = window.innerHeight;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  const step = 60;
  ctx.beginPath();
  for (let x = 0; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + player.vx * 0.05, player.y + player.vy * 0.05);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(
    `x:${player.x.toFixed(0)} y:${player.y.toFixed(0)}  v:${Math.hypot(player.vx, player.vy).toFixed(0)}`,
    12, h - 16
  );
}

function loop(t) {
  if (!lastT) lastT = t;
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
