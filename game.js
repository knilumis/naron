const MAX_HP = 5;
let turn = 1;

let phase = "PICK"; // PICK / RESOLVE / END
let pickSeconds = 8;
let timeLeft = pickSeconds;
let busy = false;
let lastTick = 0;

let player = { hp: MAX_HP };
let enemy  = { hp: MAX_HP };

const RESULT_HOLD_MS  = 5000;  // sonuç ekranda ne kadar kalsın

const REVEAL_DELAY_MS = 1000;   // Rakibin kartı görünmeden önce bekleme
const OVERLAY_HOLD_MS = 5000;  // Ortadaki VS ekranı ne kadar kalsın (önerim: 2500)
const BETWEEN_TURNS_MS = 1000;  // Overlay kapandıktan sonra yeni tura geçmeden bekleme

const el = {
  phase: document.getElementById("phase"),
  timer: document.getElementById("timer"),
  turnNo: document.getElementById("turnNo"),
  log: document.getElementById("log"),
  hpP: document.getElementById("hpP"),
  hpE: document.getElementById("hpE"),
  hpTxtP: document.getElementById("hpTxtP"),
  hpTxtE: document.getElementById("hpTxtE"),
  lastP: document.getElementById("lastP"),
  lastE: document.getElementById("lastE"),
  cards: [...document.querySelectorAll("#cards .card")],
  overlay: document.getElementById("overlay"),
  ovP: document.getElementById("ovP"),
  ovE: document.getElementById("ovE"),
  ovPEffect: document.getElementById("ovPEffect"),
  ovEEffect: document.getElementById("ovEEffect"),



};

function showOverlay(pCard, eCard){
  if (!el.overlay || !el.ovP || !el.ovE) return;
  el.ovP.textContent = CARD[pCard].name;
  el.ovE.textContent = CARD[eCard].name;
  el.overlay.classList.remove("hidden");
  el.overlay.setAttribute("aria-hidden", "false");
  if (el.ovPEffect) el.ovPEffect.textContent = "—";
  if (el.ovEEffect) el.ovEEffect.textContent = "—";

}

function hideOverlay(){
  if (!el.overlay) return;
  el.overlay.classList.add("hidden");
  el.overlay.setAttribute("aria-hidden", "true");
}



const CARD = {
  attack: { name: "SALDIR" },
  guard:  { name: "SAVUN" },
  heal:   { name: "İYİLEŞ" }
};

function setPhase(text){
  el.phase.textContent = text;
}

function setLog(text){
  el.log.textContent = text;
}

function clampHp(){
  player.hp = Math.max(0, Math.min(MAX_HP, player.hp));
  enemy.hp  = Math.max(0, Math.min(MAX_HP, enemy.hp));
}

function sync(){
  el.turnNo.textContent = String(turn);
  el.timer.textContent = String(Math.ceil(timeLeft));

  el.hpTxtP.textContent = `${player.hp}/${MAX_HP}`;
  el.hpTxtE.textContent = `${enemy.hp}/${MAX_HP}`;

  el.hpP.style.width = `${(player.hp / MAX_HP) * 100}%`;
  el.hpE.style.width = `${(enemy.hp / MAX_HP) * 100}%`;
}

function enableCards(on){
  el.cards.forEach(b => b.disabled = !on);
}

function resetGame(){
  turn = 1;
  phase = "PICK";
  timeLeft = pickSeconds;
  busy = false;
  player.hp = MAX_HP;
  enemy.hp = MAX_HP;

  el.lastP.textContent = "—";
  el.lastE.textContent = "—";

  setPhase("Kart seç");
  setLog("Bir kart seç. Hepsi bu.");
  enableCards(true);
  sync();
  hideOverlay();

}

function aiChoose(){
  // Çok basit ve anlaşılır: düşük can = iyileşme eğilimi, aksi halde saldırı/savun karışık
  if (enemy.hp <= 2 && Math.random() < 0.55) return "heal";
  const r = Math.random();
  if (r < 0.45) return "attack";
  if (r < 0.75) return "guard";
  return "heal";
}

/**
 * Çözüm kuralı (basit):
 * - SALDIR: 2 hasar
 * - SAVUN: gelen hasarı 2 azaltır (minimum 0)
 * - İYİLEŞ: +1 can
 *
 * Aynı anda çözülür:
 * - Önce herkesin İYİLEŞ'i uygulanır
 * - Sonra hasarlar hesaplanır (savunma varsa azaltır)
 */
function resolve(p, e){

  let pEffect = "ETKİ YOK";
  let eEffect = "ETKİ YOK";

  // 1) heal first
  if (p === "heal") player.hp += 1;
  if (e === "heal") enemy.hp += 1;
  clampHp();

  // 2) compute damage
  let dmgToE = (p === "attack") ? 2 : 0;
  let dmgToP = (e === "attack") ? 2 : 0;

  if (e === "guard") dmgToE = Math.max(0, dmgToE - 2);
  if (p === "guard") dmgToP = Math.max(0, dmgToP - 2);

  enemy.hp -= dmgToE;
  player.hp -= dmgToP;
  clampHp();

  // Oyuncu efekti
    if (p === "heal") pEffect = "+1 CAN";
    else if (dmgToP > 0) pEffect = `-${dmgToP} CAN`;
    else if (p === "guard") pEffect = "BLOKE";

    // Rakip efekti
    if (e === "heal") eEffect = "+1 CAN";
    else if (dmgToE > 0) eEffect = `-${dmgToE} CAN`;
    else if (e === "guard") eEffect = "BLOKE";


  // 3) log (tek cümle, net)
  const pName = CARD[p].name;
  const eName = CARD[e].name;

  let msg = `Sen ${pName}, rakip ${eName}. `;
  const parts = [];

  if (p === "heal") parts.push("Sen 1 can kazandın.");
  if (e === "heal") parts.push("Rakip 1 can kazandı.");

  if (dmgToE > 0) parts.push(`Rakıbe ${dmgToE} hasar verdin.`);
  if (dmgToP > 0) parts.push(`(${dmgToP} hasar aldın.)`);

  if (parts.length === 0) parts.push("Hasar yok.");

  msg += parts.join(" ");
  
  return {
  log: msg,
  pEffect: pEffect,
  eEffect: eEffect
};

  
}

function endIfNeeded(){
  if (player.hp <= 0 || enemy.hp <= 0){
    phase = "END";
    enableCards(false);
    if (enemy.hp <= 0 && player.hp > 0){
      setPhase("Kazandın");
      setLog("Kazandın. 1 saniye sonra yeni oyun.");
    } else if (player.hp <= 0 && enemy.hp > 0){
      setPhase("Kaybettin");
      setLog("Kaybettin. 1 saniye sonra yeni oyun.");
    } else {
      setPhase("Berabere");
      setLog("Berabere. 1 saniye sonra yeni oyun.");
    }
    sync();
    setTimeout(resetGame, 1100);
    return true;
  }
  return false;
}

function doTurn(pCard, opts = { auto: false }) {
  if (busy || phase !== "PICK") return;
  busy = true;
  phase = "RESOLVE";
  enableCards(false);

  const eCard = aiChoose();

  el.lastP.textContent = CARD[pCard].name;
  el.lastE.textContent = "…";

  if (opts.auto) {
    setPhase("Süre doldu");
    setLog(`Süre bitti. Otomatik olarak ${CARD[pCard].name} seçildi…`);
  } else {
    setPhase("Çözülüyor");
    setLog("Hamleler yapılıyor…");
  }

  // Rakibin kartını da göster, sonra sonucu hesapla
  setTimeout(() => {
    el.lastE.textContent = CARD[eCard].name;

    // Sonuç overlay'i aç
    showOverlay(pCard, eCard);

    // Sonucu hesapla ve altta yaz
    const res = resolve(pCard, eCard);
    setLog(res.log);

    if (el.ovPEffect) el.ovPEffect.textContent = res.pEffect;
    if (el.ovEEffect) el.ovEEffect.textContent = res.eEffect;

    setPhase("Tur sonucu");

    sync();

    // 2 saniye bekle, sonra overlay kapanıp yeni tura geçsin
    setTimeout(() => {
    hideOverlay();

    // Küçük bir nefes arası
    setTimeout(() => {
        if (endIfNeeded()) { busy = false; return; }

        turn += 1;
        timeLeft = pickSeconds;
        phase = "PICK";
        busy = false;

        el.lastP.textContent = "—";
        el.lastE.textContent = "—";
        setPhase("Kart seç");
        enableCards(true);
        sync();
    }, BETWEEN_TURNS_MS);

    }, OVERLAY_HOLD_MS);


  }, REVEAL_DELAY_MS);

}


function autoPick(){
  // süre biterse sakin seçim: çoğunlukla savun
  const r = Math.random();
  if (r < 0.45) return "guard";
  if (r < 0.80) return "attack";
  return "heal";
}

function tick(t){
  if (!lastTick) lastTick = t;
  const dt = (t - lastTick) / 1000;
  lastTick = t;

  if (phase === "PICK" && !busy){
    timeLeft -= dt;
    if (timeLeft <= 0){
      timeLeft = 0;
      doTurn(autoPick(), { auto: true });
    }
  }

  sync();
  requestAnimationFrame(tick);
}

el.cards.forEach(btn => {
  btn.addEventListener("click", () => doTurn(btn.dataset.card));
});

resetGame();
requestAnimationFrame(tick);
