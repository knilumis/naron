const SAVE_KEY = "naron_rpg_save_v5";
const T = { G: 0, R: 1, W: 2, TR: 3, WL: 4, ST: 5, P: 6, F: 7 };
const ENEMIES = [
  { id: "slime", n: "Yesil Balcik", lv: 1, hp: 16, atk: 4, def: 1, exp: 10, gold: 6, c: 0x56c271 },
  { id: "wolf", n: "Yabani Kurt", lv: 2, hp: 22, atk: 6, def: 2, exp: 15, gold: 9, c: 0x90a4b5 },
  { id: "bandit", n: "Haydut", lv: 3, hp: 28, atk: 8, def: 3, exp: 22, gold: 14, c: 0xd6891f },
  { id: "golem", n: "Tas Devi", lv: 5, hp: 40, atk: 10, def: 5, exp: 34, gold: 20, c: 0x9ca3af }
];
const NPC_TYPES = {
  quest: { id: "quest", name: "Gorev Ustasi", color: 0xf5c16c },
  weapon: { id: "weapon", name: "Silah Ustasi", color: 0xd97706 },
  armor: { id: "armor", name: "Zirh Ustasi", color: 0x2563eb },
  healer: { id: "healer", name: "Sifaci", color: 0x16a34a }
};
const QUESTS = [
  { id: "q_wood", title: "8 Odun Topla", type: "collect", resource: "wood", target: 8, rewardGold: 35, rewardPot: 1, rewardStat: 1, rewardSkill: 0 },
  { id: "q_hunt", title: "5 Gezen Yaratik Oldur", type: "kill", enemy: "any", target: 5, rewardGold: 55, rewardPot: 1, rewardStat: 1, rewardSkill: 1 },
  { id: "q_stone", title: "10 Tas Topla", type: "collect", resource: "stone", target: 10, rewardGold: 70, rewardPot: 2, rewardStat: 2, rewardSkill: 1 }
];
const WEAPON_COST_BASE = 35;
const ARMOR_COST_BASE = 35;
const HEAL_COST = 18;
const MOB_COUNT = 12;
const WORLD_VERSION = 3;
const ATTACK_RADIUS = 30;
const ATTACK_COOLDOWN_MS = 420;
const SKILLS = {
  power: { name: "Guc Darbesi", max: 3 },
  skin: { name: "Demir Deri", max: 3 },
  medic: { name: "Saha Sifasi", max: 3 },
  flow: { name: "Savas Akisi", max: 2 }
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const dmg = (atk, def, lo = 0.9, hi = 1.15) => Math.max(1, Math.floor(Math.max(1, atk - Math.floor(def * 0.55)) * Phaser.Math.FloatBetween(lo, hi)));
const pickEnemy = (lv) => ({ ...(Phaser.Utils.Array.GetRandom(ENEMIES.filter((e) => e.lv <= Math.max(1, lv + 1))) || ENEMIES[0]) });

function baseState() {
  return {
    p: { lv: 1, exp: 0, next: 20, hp: 24, max: 24, atk: 6, def: 2, speed: 140, pts: 0, skp: 0, str: 0, vit: 0, agi: 0 },
    gold: 10,
    inv: { wood: 0, stone: 0, pot: 2 },
    shop: { weaponLv: 0, armorLv: 0 },
    skills: { power: 0, skin: 0, medic: 0, flow: 0 },
    q: {
      idx: 0,
      accepted: false,
      done: false,
      turnedIn: false,
      id: QUESTS[0].id,
      t: QUESTS[0].title,
      type: QUESTS[0].type,
      res: QUESTS[0].resource || "none",
      enemy: QUESTS[0].enemy || "none",
      tar: QUESTS[0].target,
      prog: 0,
      reward: QUESTS[0].rewardGold,
      rewardPot: QUESTS[0].rewardPot,
      rewardStat: QUESTS[0].rewardStat,
      rewardSkill: QUESTS[0].rewardSkill
    },
    f: { guide: false },
    world: null
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return baseState();
    const b = baseState();
    const s = JSON.parse(raw);
    return {
      ...b, ...s,
      p: { ...b.p, ...(s.p || {}) },
      inv: { ...b.inv, ...(s.inv || {}) },
      shop: { ...b.shop, ...(s.shop || {}) },
      skills: { ...b.skills, ...(s.skills || {}) },
      q: { ...b.q, ...(s.q || {}) },
      f: { ...b.f, ...(s.f || {}) }
    };
  } catch (_) {
    return baseState();
  }
}

function saveState(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (_) {}
}

class WorldScene extends Phaser.Scene {
  constructor() {
    super("world");
    this.ts = 16;
    this.w = 80;
    this.h = 52;
    this.cdEncounter = 7000;
  }

  create() {
    this.s = loadState();
    this.ensureQuestState();
    if (!this.s.world || !Array.isArray(this.s.world.map) || this.s.world.map.length !== this.h || this.s.world.map[0]?.length !== this.w || !this.s.world.city || !Array.isArray(this.s.world.npcs) || this.s.world.ver !== WORLD_VERSION) {
      this.s.world = this.makeWorld();
      saveState(this.s);
    }
    this.map = this.s.world.map;
    this.makePlayerTex();
    this.makeNpcTex();
    this.makeMobTex();
    this.g = this.add.graphics();
    this.drawMap();

    this.walls = this.physics.add.staticGroup();
    this.res = this.physics.add.staticGroup();
    this.buildColliders();

    const sp = this.s.world.player || { x: this.s.world.spawn.x, y: this.s.world.spawn.y, d: "down" };
    if (!this.isWalkableTile(sp.x, sp.y)) {
      sp.x = this.s.world.spawn.x;
      sp.y = this.s.world.spawn.y;
      sp.d = "down";
      this.s.world.player = { ...sp };
      saveState(this.s);
    }
    this.player = this.physics.add.sprite(sp.x * this.ts + this.ts / 2, sp.y * this.ts + this.ts / 2, "p_down_0");
    this.player.body.setSize(10, 12, true);
    this.player.setCollideWorldBounds(true);
    this.player.last = sp.d || "down";
    this.player.anims.play(`idle_${this.player.last}`, true);
    this.npcs = [];
    this.spawnCityNpcs();
    this.mobs = this.physics.add.group();
    this.spawnMobs();

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.res);
    this.physics.add.collider(this.mobs, this.walls);
    this.physics.add.collider(this.mobs, this.res);

    const worldW = this.w * this.ts;
    const worldH = this.h * this.ts;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.setZoom(this.zoomFor(this.scale.width));

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");
    this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyI = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyK = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyM = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.cbE = () => this.interact();
    this.cbSpace = () => this.tryAreaAttack();
    this.cbI = () => this.toggleInv();
    this.cbK = () => { this.saveGame(); this.toast("Oyun kaydedildi."); };
    this.cbM = () => this.toggleMinimap();
    this.cbQ = () => this.toggleQuest();
    this.keyE.on("down", this.cbE);
    this.keySpace.on("down", this.cbSpace);
    this.keyI.on("down", this.cbI);
    this.keyK.on("down", this.cbK);
    this.keyM.on("down", this.cbM);
    this.keyQ.on("down", this.cbQ);
    this.domKeyDown = (ev) => {
      const tag = (ev.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const key = (ev.key || "").toLowerCase();
      if (key === "m" || ev.code === "KeyM" || ev.keyCode === 77) {
        this.toggleMinimap();
        ev.preventDefault();
      }
      if (key === " " || key === "spacebar" || ev.code === "Space" || ev.keyCode === 32) {
        this.tryAreaAttack();
        ev.preventDefault();
      }
      if (key === "q" || ev.code === "KeyQ" || ev.keyCode === 81) {
        this.toggleQuest();
        ev.preventDefault();
      }
    };
    if (typeof window !== "undefined") window.addEventListener("keydown", this.domKeyDown, true);
    if (typeof document !== "undefined") document.addEventListener("keydown", this.domKeyDown, true);
    this.bindDomMapButton();

    this.makeUi();
    this.makeTouch();
    this.createDomInventory();
    this.createDomNpcDialog();
    this.createDomQuest();
    this.createDomMap();
    this.createMinimap();
    this.layout();
    this.refreshUi();

    this.respawn = new Map();
    this.lastInteract = 0;
    this.lastAttackAt = 0;
    this.lastHurtToastAt = 0;
    this.lockEncounter = this.time.now + 1200;
    this.hitFx = this.add.graphics().setDepth(2050);
    this.physics.add.overlap(this.player, this.mobs, this.onMobTouch, null, this);

    this.scale.on("resize", this.onResize, this);
    this.autosave = this.time.addEvent({ delay: 15000, loop: true, callback: () => this.saveGame() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.toast("E: Etkilesim | SPACE: Saldiri | Q: Gorev | M: Harita | I: Envanter", 2400);
  }

  shutdown() {
    this.saveGame();
    this.scale.off("resize", this.onResize, this);
    this.keyE.off("down", this.cbE);
    this.keySpace.off("down", this.cbSpace);
    this.keyI.off("down", this.cbI);
    this.keyK.off("down", this.cbK);
    this.keyM.off("down", this.cbM);
    this.keyQ.off("down", this.cbQ);
    if (typeof window !== "undefined" && this.domKeyDown) window.removeEventListener("keydown", this.domKeyDown, true);
    if (typeof document !== "undefined" && this.domKeyDown) document.removeEventListener("keydown", this.domKeyDown, true);
    this.unbindDomMapButton();
    if (this.pDown) {
      this.input.off("pointerdown", this.pDown);
      this.input.off("pointermove", this.pMove);
      this.input.off("pointerup", this.pUp);
      this.input.off("pointerupoutside", this.pUp);
    }
    this.destroyMinimap();
    this.destroyDomMap();
    this.destroyDomQuest();
    this.destroyDomNpcDialog();
    this.destroyDomInventory();
    this.hitFx?.destroy();
    this.autosave?.remove(false);
  }

  onResize(size) {
    this.cameras.main.setZoom(this.zoomFor(size.width));
    this.layout();
  }

  zoomFor(w) { return w < 460 ? 2 : w < 980 ? 3 : 4; }
  sk(id) { return this.s.skills?.[id] || 0; }
  atkVal() { return this.s.p.atk + this.sk("power"); }
  defVal() { return this.s.p.def + this.sk("skin"); }
  potionHeal() { return 16 + this.sk("medic") * 4; }

  canLearn(id) {
    const rank = this.sk(id);
    const max = SKILLS[id]?.max ?? 0;
    if (this.s.p.skp <= 0) return { ok: false, reason: "Yetenek puanin yok." };
    if (rank >= max) return { ok: false, reason: "Yetenek zaten en yuksek seviyede." };
    if (id === "medic" && this.sk("power") < 1) return { ok: false, reason: "Guc Darbesi 1 gerekli." };
    if (id === "flow" && (this.sk("power") < 2 || this.sk("skin") < 1)) return { ok: false, reason: "Guc 2 + Deri 1 gerekli." };
    return { ok: true, reason: "" };
  }

  getQuestTemplate(idx) {
    return QUESTS[((idx % QUESTS.length) + QUESTS.length) % QUESTS.length];
  }

  setQuestFromTemplate(idx) {
    const qd = this.getQuestTemplate(idx);
    this.s.q = {
      idx,
      accepted: true,
      done: false,
      turnedIn: false,
      id: qd.id,
      t: qd.title,
      type: qd.type,
      res: qd.resource || "none",
      enemy: qd.enemy || "none",
      tar: qd.target,
      prog: 0,
      reward: qd.rewardGold,
      rewardPot: qd.rewardPot,
      rewardStat: qd.rewardStat,
      rewardSkill: qd.rewardSkill
    };
  }

  ensureQuestState() {
    if (!this.s.q || typeof this.s.q !== "object") this.setQuestFromTemplate(0);
    if (typeof this.s.q.accepted !== "boolean") this.s.q.accepted = false;
    if (typeof this.s.q.turnedIn !== "boolean") this.s.q.turnedIn = false;
    if (typeof this.s.q.idx !== "number") this.s.q.idx = 0;
    if (!this.s.q.t || !this.s.q.type) this.setQuestFromTemplate(this.s.q.idx || 0);
  }

  tryProgressQuest(type, key, amount = 1) {
    this.ensureQuestState();
    const q = this.s.q;
    if (!q.accepted || q.done) return;
    if (q.type !== type) return;
    if (type === "collect" && q.res !== key) return;
    if (type === "kill" && q.enemy !== "any" && q.enemy !== key) return;
    q.prog = clamp(q.prog + amount, 0, q.tar);
    if (q.prog >= q.tar) {
      q.done = true;
      this.toast("Gorev tamamlandi. Gorev Ustasi ile konus.", 1800);
    }
  }

  turnInQuest() {
    const q = this.s.q;
    if (!q.accepted) {
      this.setQuestFromTemplate(q.idx || 0);
      this.toast(`Gorev alindi: ${this.s.q.t}`, 1800);
      this.refreshUi();
      this.refreshInv();
      return;
    }
    if (!q.done) {
      this.toast(`Gorev ilerleme: ${q.prog}/${q.tar} (${q.t})`, 1600);
      return;
    }
    this.s.gold += q.reward;
    this.s.inv.pot += q.rewardPot;
    this.s.p.pts += q.rewardStat;
    this.s.p.skp += q.rewardSkill;
    this.toast(`Odul: +${q.reward}G +${q.rewardPot}P +${q.rewardStat}OZL +${q.rewardSkill}YET`, 2200);
    this.setQuestFromTemplate((q.idx || 0) + 1);
    this.s.q.accepted = false;
    this.s.q.done = false;
    this.s.q.prog = 0;
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
  }

  weaponCost() { return WEAPON_COST_BASE + this.s.shop.weaponLv * 20; }
  armorCost() { return ARMOR_COST_BASE + this.s.shop.armorLv * 20; }

  buyWeaponUpgrade() {
    const cost = this.weaponCost();
    if (this.s.gold < cost) return this.toast(`${cost} altin gerekli.`, 1300);
    this.s.gold -= cost;
    this.s.shop.weaponLv += 1;
    this.s.p.atk += 2;
    this.toast(`Silah Sev.${this.s.shop.weaponLv} oldu.`, 1500);
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
  }

  buyArmorUpgrade() {
    const cost = this.armorCost();
    if (this.s.gold < cost) return this.toast(`${cost} altin gerekli.`, 1300);
    this.s.gold -= cost;
    this.s.shop.armorLv += 1;
    this.s.p.def += 2;
    this.s.p.max += 5;
    this.s.p.hp += 5;
    this.toast(`Zirh Sev.${this.s.shop.armorLv} oldu.`, 1500);
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
  }

  buyHealService() {
    if (this.s.p.hp >= this.s.p.max) return this.toast("Can zaten dolu.", 1200);
    if (this.s.gold < HEAL_COST) return this.toast(`${HEAL_COST} altin gerekli.`, 1300);
    this.s.gold -= HEAL_COST;
    this.s.p.hp = this.s.p.max;
    this.toast("Can tamamen yenilendi.", 1300);
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
  }

  addStat(kind) {
    if (this.s.p.pts <= 0) return this.toast("Dagitilacak stat puani yok.", 1200);
    if (kind === "str") { this.s.p.str += 1; this.s.p.atk += 1; }
    else if (kind === "vit") { this.s.p.vit += 1; this.s.p.max += 4; this.s.p.hp += 4; }
    else if (kind === "agi") { this.s.p.agi += 1; this.s.p.speed = clamp(this.s.p.speed + 4, 80, 260); }
    else return;
    this.s.p.pts -= 1;
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
  }

  learnSkill(id) {
    const c = this.canLearn(id);
    if (!c.ok) return this.toast(c.reason, 1300);
    this.s.skills[id] = this.sk(id) + 1;
    this.s.p.skp -= 1;
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
    this.toast(`${SKILLS[id].name} Sev.${this.sk(id)}`, 1400);
  }

  makeUi() {
    const sty = { fontFamily: "Verdana, sans-serif", color: "#fff" };
    this.txtStats = this.add.text(0, 0, "", { ...sty, fontSize: "14px", backgroundColor: "rgba(0,0,0,0.35)", padding: { left: 8, right: 8, top: 6, bottom: 6 } }).setScrollFactor(0).setDepth(2000);
    this.txtQuest = this.add.text(0, 0, "", { ...sty, fontSize: "13px", backgroundColor: "rgba(0,0,0,0.32)", padding: { left: 8, right: 8, top: 6, bottom: 6 }, wordWrap: { width: 290 } }).setScrollFactor(0).setDepth(2000);
    this.txtHint = this.add.text(0, 0, "", { ...sty, fontSize: "12px", backgroundColor: "rgba(0,0,0,0.32)", padding: { left: 8, right: 8, top: 4, bottom: 4 } }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(2000);
    this.txtToast = this.add.text(0, 0, "", { ...sty, fontSize: "13px", backgroundColor: "rgba(0,0,0,0.45)", padding: { left: 10, right: 10, top: 5, bottom: 5 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(2200).setVisible(false);

    this.hpBarBg = this.add.rectangle(0, 0, 240, 14, 0x000000, 0.58).setOrigin(0, 0).setScrollFactor(0).setDepth(2050);
    this.hpBarBg.setStrokeStyle(1, 0xffffff, 0.28);
    this.hpBarFill = this.add.rectangle(0, 0, 236, 10, 0x22c55e, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(2051);
    this.expBarBg = this.add.rectangle(0, 0, 240, 12, 0x000000, 0.56).setOrigin(0, 0).setScrollFactor(0).setDepth(2050);
    this.expBarBg.setStrokeStyle(1, 0xffffff, 0.24);
    this.expBarFill = this.add.rectangle(0, 0, 236, 8, 0x60a5fa, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(2051);
    this.txtHpBar = this.add.text(0, 0, "", { ...sty, fontSize: "10px" }).setOrigin(0.5).setScrollFactor(0).setDepth(2052);
    this.txtExpBar = this.add.text(0, 0, "", { ...sty, fontSize: "9px" }).setOrigin(0.5).setScrollFactor(0).setDepth(2052);

    this.txtKeys = this.add.text(0, 0, "Tus Rehberi\nHARITA (M)\nENVANTER (I)\nGOREVLER (Q)\nE ETKILESIM\nSPACE SALDIRI\nWASD HAREKET", {
      ...sty,
      fontSize: "10px",
      backgroundColor: "rgba(0,0,0,0.36)",
      padding: { left: 6, right: 6, top: 5, bottom: 5 }
    }).setScrollFactor(0).setDepth(2050).setOrigin(1, 0);

    this.invOpen = false;
    this.questOpen = false;
    this.invPage = 0;
    this.invBg = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.65).setOrigin(0, 0).setScrollFactor(0).setDepth(2300).setVisible(false);
    this.invBg.setInteractive().on("pointerdown", () => this.toggleInv(false));
    this.invPanel = this.add.rectangle(0, 0, 340, 300, 0x0c1320, 0.94).setStrokeStyle(2, 0xffffff, 0.18).setScrollFactor(0).setDepth(2301).setVisible(false);
    this.invTitle = this.add.text(0, 0, "Envanter", { ...sty, fontSize: "16px" }).setOrigin(0.5).setScrollFactor(0).setDepth(2302).setVisible(false);
    this.invTxt = this.add.text(0, 0, "", { ...sty, color: "#e5e7eb", fontSize: "11px", lineSpacing: 2 }).setScrollFactor(0).setDepth(2302).setVisible(false);
    this.statTxt = this.add.text(0, 0, "", { ...sty, color: "#cdd6f4", fontSize: "10px", lineSpacing: 1 }).setScrollFactor(0).setDepth(2302).setVisible(false);
    this.skillTxt = this.add.text(0, 0, "", { ...sty, color: "#c4f2d4", fontSize: "10px", lineSpacing: 1 }).setScrollFactor(0).setDepth(2302).setVisible(false);

    this.btnStr = this.mkBtn("+GUC", 58, 22, 0x7c3aed, () => this.addStat("str"), 10);
    this.btnVit = this.mkBtn("+DAY", 58, 22, 0x0f766e, () => this.addStat("vit"), 10);
    this.btnAgi = this.mkBtn("+CEV", 58, 22, 0xb45309, () => this.addStat("agi"), 10);
    this.btnSkillPower = this.mkBtn("Guc", 64, 22, 0xb91c1c, () => this.learnSkill("power"), 10);
    this.btnSkillSkin = this.mkBtn("Deri", 64, 22, 0x1d4ed8, () => this.learnSkill("skin"), 10);
    this.btnSkillMedic = this.mkBtn("Sifa", 64, 22, 0x15803d, () => this.learnSkill("medic"), 10);
    this.btnSkillFlow = this.mkBtn("Akim", 64, 22, 0x6b21a8, () => this.learnSkill("flow"), 10);
    this.btnPage = this.mkBtn("YETENEK", 82, 24, 0x374151, () => this.toggleInvPage(), 9);

    this.btnClose = this.mkBtn("X", 28, 24, 0xb91c1c, () => this.toggleInv(false), 10);
    this.invControls = [
      this.btnClose.c,
      this.btnPage.c,
      this.btnStr.c, this.btnVit.c, this.btnAgi.c,
      this.btnSkillPower.c, this.btnSkillSkin.c, this.btnSkillMedic.c, this.btnSkillFlow.c
    ];
    this.invControls.forEach((o) => o.setScrollFactor(0).setDepth(2302).setVisible(false));
  }

  createDomInventory() {
    if (typeof document === "undefined") return;
    if (this.domInv) return;

    const overlay = document.createElement("div");
    overlay.className = "inv-overlay-html";
    overlay.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "inv-panel-html";
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());

    const head = document.createElement("div");
    head.className = "inv-head-html";

    const pageBtn = document.createElement("button");
    pageBtn.className = "inv-btn-html";
    pageBtn.textContent = "YETENEK";
    pageBtn.onclick = () => this.toggleInvPage();

    const title = document.createElement("div");
    title.className = "inv-title-html";
    title.textContent = "Envanter";

    const closeBtn = document.createElement("button");
    closeBtn.className = "inv-btn-html inv-btn-close";
    closeBtn.textContent = "X";
    closeBtn.onclick = () => this.toggleInv(false);

    head.appendChild(pageBtn);
    head.appendChild(title);
    head.appendChild(closeBtn);

    const summary = document.createElement("pre");
    summary.className = "inv-text-html";

    const stats = document.createElement("pre");
    stats.className = "inv-text-html";

    const statRow = document.createElement("div");
    statRow.className = "inv-row-html";
    const strBtn = document.createElement("button");
    strBtn.className = "inv-btn-html";
    strBtn.textContent = "+GUC";
    strBtn.onclick = () => this.addStat("str");
    const vitBtn = document.createElement("button");
    vitBtn.className = "inv-btn-html";
    vitBtn.textContent = "+DAY";
    vitBtn.onclick = () => this.addStat("vit");
    const agiBtn = document.createElement("button");
    agiBtn.className = "inv-btn-html";
    agiBtn.textContent = "+CEV";
    agiBtn.onclick = () => this.addStat("agi");
    statRow.appendChild(strBtn);
    statRow.appendChild(vitBtn);
    statRow.appendChild(agiBtn);

    const skills = document.createElement("pre");
    skills.className = "inv-text-html";

    const skillGrid = document.createElement("div");
    skillGrid.className = "inv-grid-html";
    const powerBtn = document.createElement("button");
    powerBtn.className = "inv-btn-html";
    powerBtn.textContent = "Guc";
    powerBtn.onclick = () => this.learnSkill("power");
    const skinBtn = document.createElement("button");
    skinBtn.className = "inv-btn-html";
    skinBtn.textContent = "Deri";
    skinBtn.onclick = () => this.learnSkill("skin");
    const medicBtn = document.createElement("button");
    medicBtn.className = "inv-btn-html";
    medicBtn.textContent = "Sifa";
    medicBtn.onclick = () => this.learnSkill("medic");
    const flowBtn = document.createElement("button");
    flowBtn.className = "inv-btn-html";
    flowBtn.textContent = "Akim";
    flowBtn.onclick = () => this.learnSkill("flow");
    skillGrid.appendChild(powerBtn);
    skillGrid.appendChild(skinBtn);
    skillGrid.appendChild(medicBtn);
    skillGrid.appendChild(flowBtn);

    panel.appendChild(head);
    panel.appendChild(summary);
    panel.appendChild(stats);
    panel.appendChild(statRow);
    panel.appendChild(skills);
    panel.appendChild(skillGrid);
    overlay.appendChild(panel);
    overlay.addEventListener("pointerdown", () => this.toggleInv(false));
    document.body.appendChild(overlay);

    this.domInv = {
      overlay,
      pageBtn,
      summary,
      stats,
      statRow,
      skills,
      skillGrid,
      statBtns: { strBtn, vitBtn, agiBtn },
      skillBtns: { powerBtn, skinBtn, medicBtn, flowBtn }
    };
  }

  destroyDomInventory() {
    if (!this.domInv) return;
    this.domInv.overlay.remove();
    this.domInv = null;
  }

  createDomQuest() {
    if (typeof document === "undefined" || this.domQuest) return;

    const overlay = document.createElement("div");
    overlay.className = "quest-overlay-html";
    overlay.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "quest-panel-html";
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());

    const head = document.createElement("div");
    head.className = "quest-head-html";
    const title = document.createElement("div");
    title.className = "quest-title-html";
    title.textContent = "Gorev Ekrani";
    const closeBtn = document.createElement("button");
    closeBtn.className = "quest-btn-html";
    closeBtn.textContent = "X";
    closeBtn.onclick = () => this.toggleQuest(false);
    head.appendChild(title);
    head.appendChild(closeBtn);

    const body = document.createElement("pre");
    body.className = "quest-body-html";

    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    overlay.addEventListener("pointerdown", () => this.toggleQuest(false));
    document.body.appendChild(overlay);

    this.domQuest = { overlay, body, visible: false };
  }

  destroyDomQuest() {
    if (!this.domQuest) return;
    this.domQuest.overlay.remove();
    this.domQuest = null;
  }

  toggleQuest(force) {
    if (!this.domQuest) return;
    const now = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
    if (typeof force !== "boolean" && typeof this.lastQuestToggle === "number" && now - this.lastQuestToggle < 120) return;
    this.lastQuestToggle = now;
    const on = typeof force === "boolean" ? force : !this.questOpen;
    if (on) {
      this.toggleInv(false);
      if (this.domNpc?.visible) this.closeNpcDialog();
      if (this.domMap?.visible) this.toggleMinimap(false);
    }
    this.questOpen = on;
    if (on) {
      this.refreshQuestPanel();
      this.domQuest.visible = true;
      this.domQuest.overlay.style.display = "flex";
      return;
    }
    this.domQuest.visible = false;
    this.domQuest.overlay.style.display = "none";
  }

  refreshQuestPanel() {
    if (!this.domQuest) return;
    this.ensureQuestState();
    const q = this.s.q;
    if (!q.accepted) {
      this.domQuest.body.textContent = "Aktif gorev yok.\nE ile Gorev Ustasi ile konus.";
      return;
    }
    const stateText = q.done ? "Tamamlandi" : "Devam ediyor";
    this.domQuest.body.textContent =
      `Gorev: ${q.t}\n` +
      `Durum: ${stateText}\n` +
      `Ilerleme: ${q.prog}/${q.tar}\n` +
      `Hedef: ${this.questGoalText(q)}\n` +
      `Odul: ${this.questRewardText(q)}`;
  }

  createDomNpcDialog() {
    if (typeof document === "undefined" || this.domNpc) return;

    const overlay = document.createElement("div");
    overlay.className = "npc-overlay-html";
    overlay.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "npc-panel-html";
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());

    const head = document.createElement("div");
    head.className = "npc-head-html";
    const name = document.createElement("div");
    name.className = "npc-name-html";
    name.textContent = "Karakter";
    const closeBtn = document.createElement("button");
    closeBtn.className = "npc-btn-html npc-close-html";
    closeBtn.textContent = "X";
    closeBtn.onclick = () => this.closeNpcDialog();
    head.appendChild(name);
    head.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "npc-body-html";

    const actions = document.createElement("div");
    actions.className = "npc-actions-html";

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    overlay.addEventListener("pointerdown", () => this.closeNpcDialog());
    document.body.appendChild(overlay);

    this.domNpc = { overlay, panel, name, body, actions, visible: false };
  }

  destroyDomNpcDialog() {
    if (!this.domNpc) return;
    this.domNpc.overlay.remove();
    this.domNpc = null;
  }

  closeNpcDialog() {
    if (!this.domNpc) return;
    this.domNpc.visible = false;
    this.domNpc.overlay.style.display = "none";
  }

  addNpcDialogButton(label, fn, accent = false) {
    if (!this.domNpc) return;
    const b = document.createElement("button");
    b.className = `npc-btn-html${accent ? " npc-accent-html" : ""}`;
    b.textContent = label;
    b.onclick = () => fn?.();
    this.domNpc.actions.appendChild(b);
  }

  openNpcDialog(title, text, builder) {
    if (!this.domNpc) {
      this.toast(text.replace(/\n/g, " "), 1800);
      return;
    }
    this.domNpc.name.textContent = title;
    this.domNpc.body.textContent = text;
    this.domNpc.actions.innerHTML = "";
    builder?.();
    this.domNpc.visible = true;
    this.domNpc.overlay.style.display = "flex";
  }

  questGoalText(q) {
    if (q.type === "collect") {
      const resName = q.res === "wood" ? "odun" : q.res === "stone" ? "tas" : q.res;
      return `${q.tar} ${resName}`;
    }
    if (q.type === "kill") return `${q.tar} yaratik`;
    return `${q.tar} hedef`;
  }

  questRewardText(q) {
    return `${q.reward} Altin, ${q.rewardPot} Iksir, +${q.rewardStat} Stat, +${q.rewardSkill} Yetenek`;
  }

  acceptCurrentQuest() {
    const idx = typeof this.s.q?.idx === "number" ? this.s.q.idx : 0;
    this.setQuestFromTemplate(idx);
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
  }

  openQuestDialog() {
    this.ensureQuestState();
    const q = this.s.q;
    if (!q.accepted) {
      this.openNpcDialog(
        "Gorev Ustasi",
        `Yeni gorev var:\n${q.t}\nHedef: ${this.questGoalText(q)}\nOdul: ${this.questRewardText(q)}`,
        () => {
          this.addNpcDialogButton("Kabul Et", () => {
            this.acceptCurrentQuest();
            this.closeNpcDialog();
            this.toast(`Gorev alindi: ${this.s.q.t}`, 1600);
          }, true);
          this.addNpcDialogButton("Sonra", () => this.closeNpcDialog());
        }
      );
      return;
    }

    if (!q.done) {
      this.openNpcDialog(
        "Gorev Ustasi",
        `Mevcut gorev:\n${q.t}\nIlerleme: ${q.prog}/${q.tar}\nHedef: ${this.questGoalText(q)}`,
        () => this.addNpcDialogButton("Tamam", () => this.closeNpcDialog())
      );
      return;
    }

    this.openNpcDialog(
      "Gorev Ustasi",
      `Harika is.\nTeslime hazir:\n${q.t}\nOdul: ${this.questRewardText(q)}`,
      () => {
        this.addNpcDialogButton("Teslim Et", () => {
          this.turnInQuest();
          this.closeNpcDialog();
        }, true);
        this.addNpcDialogButton("Sonra", () => this.closeNpcDialog());
      }
    );
  }

  openShopDialog(role) {
    if (role === "weapon") {
      const cost = this.weaponCost();
      this.openNpcDialog(
        "Silah Ustasi",
        `Daha keskin celik, daha yuksek hasar.\nGelisim ucreti: ${cost} Altin`,
        () => {
          this.addNpcDialogButton(`Al (${cost}G)`, () => { this.buyWeaponUpgrade(); this.closeNpcDialog(); }, true);
          this.addNpcDialogButton("Ayril", () => this.closeNpcDialog());
        }
      );
      return;
    }
    if (role === "armor") {
      const cost = this.armorCost();
      this.openNpcDialog(
        "Zirh Ustasi",
        `Daha saglam zirh, daha yuksek max HP.\nGelisim ucreti: ${cost} Altin`,
        () => {
          this.addNpcDialogButton(`Al (${cost}G)`, () => { this.buyArmorUpgrade(); this.closeNpcDialog(); }, true);
          this.addNpcDialogButton("Ayril", () => this.closeNpcDialog());
        }
      );
      return;
    }
    if (role === "healer") {
      this.openNpcDialog(
        "Sifaci",
        `Canini tamamen yenileyebilirim.\nUcret: ${HEAL_COST} Altin`,
        () => {
          this.addNpcDialogButton(`Iyilestir (${HEAL_COST}G)`, () => { this.buyHealService(); this.closeNpcDialog(); }, true);
          this.addNpcDialogButton("Ayril", () => this.closeNpcDialog());
        }
      );
    }
  }

  createDomMap() {
    if (typeof document === "undefined" || this.domMap) return;

    const overlay = document.createElement("div");
    overlay.className = "map-overlay-html";
    overlay.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "map-panel-html";
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());

    const head = document.createElement("div");
    head.className = "map-head-html";
    const title = document.createElement("div");
    title.className = "map-title-html";
    title.textContent = "DUNYA HARITASI";
    const closeBtn = document.createElement("button");
    closeBtn.className = "map-btn-html";
    closeBtn.textContent = "X";
    closeBtn.onclick = () => this.toggleMinimap(false);
    head.appendChild(title);
    head.appendChild(closeBtn);

    const hint = document.createElement("div");
    hint.className = "map-hint-html";
    hint.textContent = "Sari: Sen  |  Kirmizi: Yaratiklar";

    const canvas = document.createElement("canvas");
    canvas.className = "map-canvas-html";

    panel.appendChild(head);
    panel.appendChild(hint);
    panel.appendChild(canvas);
    overlay.appendChild(panel);
    overlay.addEventListener("pointerdown", () => this.toggleMinimap(false));
    document.body.appendChild(overlay);

    this.domMap = {
      overlay,
      panel,
      canvas,
      ctx: canvas.getContext("2d"),
      visible: false
    };
  }

  destroyDomMap() {
    if (!this.domMap) return;
    this.domMap.overlay.remove();
    this.domMap = null;
  }

  drawDomMap() {
    if (!this.domMap?.ctx) return;
    const ctx = this.domMap.ctx;
    const canvas = this.domMap.canvas;
    const vw = typeof window !== "undefined" ? window.innerWidth : 960;
    const vh = typeof window !== "undefined" ? window.innerHeight : 640;
    const maxW = Math.max(240, vw - 64);
    const maxH = Math.max(180, vh - 150);
    const cell = clamp(Math.floor(Math.min(maxW / this.w, maxH / this.h)), 2, 8);
    const cw = this.w * cell;
    const ch = this.h * cell;

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = this.map[y][x];
        let col = "#1b4d2e";
        if (t === T.R) col = "#9a7a4a";
        else if (t === T.W) col = "#2b5ea9";
        else if (t === T.TR) col = "#2f7d3a";
        else if (t === T.WL) col = "#6c4a3a";
        else if (t === T.ST) col = "#6b7280";
        else if (t === T.P) col = "#9da5b2";
        else if (t === T.F) col = "#315f39";
        ctx.fillStyle = col;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    const tx = clamp(Math.floor(this.player.x / this.ts), 0, this.w - 1);
    const ty = clamp(Math.floor(this.player.y / this.ts), 0, this.h - 1);
    ctx.fillStyle = "#ffe66d";
    ctx.fillRect(tx * cell, ty * cell, Math.max(2, cell), Math.max(2, cell));

    ctx.fillStyle = "#ff8a65";
    for (const m of this.mobs?.getChildren?.() || []) {
      if (!m.active) continue;
      const mx = clamp(Math.floor(m.x / this.ts), 0, this.w - 1);
      const my = clamp(Math.floor(m.y / this.ts), 0, this.h - 1);
      ctx.fillRect(mx * cell, my * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
    }
  }

  bindDomMapButton() {
    if (typeof document === "undefined") return;
    const mapBtn = document.getElementById("map-toggle");
    if (mapBtn) {
      this.domMapBtn = mapBtn;
      this.domMapClick = (ev) => {
        ev.preventDefault();
        this.toggleMinimap();
      };
      mapBtn.addEventListener("click", this.domMapClick);
    }

    const invBtn = document.getElementById("inv-toggle");
    if (invBtn) {
      this.domInvBtn = invBtn;
      this.domInvClick = (ev) => {
        ev.preventDefault();
        this.toggleInv();
      };
      invBtn.addEventListener("click", this.domInvClick);
    }

    const questBtn = document.getElementById("quest-toggle");
    if (questBtn) {
      this.domQuestBtn = questBtn;
      this.domQuestClick = (ev) => {
        ev.preventDefault();
        this.toggleQuest();
      };
      questBtn.addEventListener("click", this.domQuestClick);
    }
  }

  unbindDomMapButton() {
    if (this.domMapBtn && this.domMapClick) this.domMapBtn.removeEventListener("click", this.domMapClick);
    if (this.domInvBtn && this.domInvClick) this.domInvBtn.removeEventListener("click", this.domInvClick);
    if (this.domQuestBtn && this.domQuestClick) this.domQuestBtn.removeEventListener("click", this.domQuestClick);
    this.domMapBtn = null;
    this.domMapClick = null;
    this.domInvBtn = null;
    this.domInvClick = null;
    this.domQuestBtn = null;
    this.domQuestClick = null;
  }

  createMinimap() {
    if (this.minimap) return;
    const cell = 2;
    const mw = this.w * cell;
    const mh = this.h * cell;
    const boxW = mw + 14;
    const boxH = mh + 26;

    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(2600).setVisible(false);
    const bg = this.add.rectangle(0, 0, boxW, boxH, 0x000000, 0.72).setOrigin(0, 0);
    bg.setStrokeStyle(1, 0xffffff, 0.2);
    const title = this.add.text(6, 4, "DUNYA HARITASI (M / DOKUN)", {
      fontFamily: "Verdana, sans-serif",
      fontSize: "10px",
      color: "#ffffff"
    });
    const mapG = this.add.graphics().setPosition(7, 20);
    const playerDot = this.add.circle(0, 0, 2, 0xffff66, 1).setPosition(7, 20);
    const mobG = this.add.graphics().setPosition(7, 20);
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerdown", () => this.toggleMinimap());
    c.add([bg, title, mapG, mobG, playerDot]);

    this.minimap = { c, bg, title, mapG, mobG, playerDot, cell, boxW, boxH, visible: false };
    this.drawMinimapBase();
  }

  destroyMinimap() {
    if (!this.minimap) return;
    this.minimap.c.destroy(true);
    this.minimap = null;
  }

  drawMinimapBase() {
    if (!this.minimap) return;
    const g = this.minimap.mapG;
    const cs = this.minimap.cell;
    g.clear();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = this.map[y][x];
        let col = 0x1b4d2e;
        if (t === T.R) col = 0x9a7a4a;
        else if (t === T.W) col = 0x2b5ea9;
        else if (t === T.TR) col = 0x2f7d3a;
        else if (t === T.WL) col = 0x6c4a3a;
        else if (t === T.ST) col = 0x6b7280;
        else if (t === T.P) col = 0x9da5b2;
        else if (t === T.F) col = 0x315f39;
        g.fillStyle(col, 1);
        g.fillRect(x * cs, y * cs, cs, cs);
      }
    }
  }

  toggleMinimap(force) {
    if (!this.minimap && !this.domMap) return;
    const now = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
    if (typeof force !== "boolean" && typeof this.lastMapToggle === "number" && now - this.lastMapToggle < 120) return;
    this.lastMapToggle = now;

    if (this.domMap) {
      const showDom = typeof force === "boolean" ? force : !this.domMap.visible;
      if (showDom && this.questOpen) this.toggleQuest(false);
      if (showDom && this.invOpen) this.toggleInv(false);
      if (showDom && this.domNpc?.visible) this.closeNpcDialog();
      this.domMap.visible = showDom;
      this.domMap.overlay.style.display = showDom ? "flex" : "none";
      if (showDom) this.drawDomMap();
    }

    if (this.minimap) {
      const showPhaser = this.domMap ? false : (typeof force === "boolean" ? force : !this.minimap.visible);
      this.minimap.visible = showPhaser;
      this.minimap.c.setVisible(showPhaser);
      if (showPhaser) this.updateMinimapDynamic();
    }
  }

  updateMinimapDynamic() {
    if (this.domMap?.visible) {
      const now = (typeof performance !== "undefined" && typeof performance.now === "function")
        ? performance.now()
        : Date.now();
      if (typeof this.lastDomMapDraw !== "number" || now - this.lastDomMapDraw > 180) {
        this.lastDomMapDraw = now;
        this.drawDomMap();
      }
    }
    if (!this.minimap || !this.minimap.visible) return;
    const cs = this.minimap.cell;
    const tx = clamp(Math.floor(this.player.x / this.ts), 0, this.w - 1);
    const ty = clamp(Math.floor(this.player.y / this.ts), 0, this.h - 1);
    this.minimap.playerDot.setPosition(7 + tx * cs + 1, 20 + ty * cs + 1);
    this.minimap.mobG.clear();
    this.minimap.mobG.fillStyle(0xff8a65, 0.95);
    for (const m of this.mobs?.getChildren?.() || []) {
      if (!m.active) continue;
      const mx = clamp(Math.floor(m.x / this.ts), 0, this.w - 1);
      const my = clamp(Math.floor(m.y / this.ts), 0, this.h - 1);
      this.minimap.mobG.fillRect(mx * cs, my * cs, cs, cs);
    }
  }

  isCityTile(tx, ty) {
    const city = this.s.world?.city;
    if (!city) return false;
    return tx >= city.x && tx < city.x + city.w && ty >= city.y && ty < city.y + city.h;
  }

  isWalkableTile(tx, ty) {
    const t = this.map[ty]?.[tx];
    return t === T.G || t === T.R || t === T.P || t === T.F;
  }

  randomWalkTile(outsideCity = false) {
    for (let i = 0; i < 500; i++) {
      const tx = rint(2, this.w - 3);
      const ty = rint(2, this.h - 3);
      if (!this.isWalkableTile(tx, ty)) continue;
      if (outsideCity && this.isCityTile(tx, ty)) continue;
      if (Math.abs(tx - this.s.world.spawn.x) + Math.abs(ty - this.s.world.spawn.y) < 8) continue;
      return { tx, ty };
    }
    return { tx: this.s.world.spawn.x + 3, ty: this.s.world.spawn.y + 3 };
  }

  makeMobTex() {
    for (const e of ENEMIES) {
      const key = `mob_${e.id}`;
      if (this.textures.exists(key)) continue;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(e.c, 1).fillRect(2, 3, 10, 10);
      g.fillStyle(0x111827, 0.6).fillRect(3, 4, 8, 2);
      g.fillStyle(0xffffff, 0.85).fillRect(4, 8, 2, 1).fillRect(8, 8, 2, 1);
      g.generateTexture(key, 14, 14);
      g.destroy();
    }
  }

  spawnCityNpcs() {
    const city = this.s.world.city || { x: this.s.world.spawn.x - 8, y: this.s.world.spawn.y - 6, w: 16, h: 12 };
    const npcSpawns = this.s.world.npcs || [
      { role: "quest", x: city.x + Math.floor(city.w / 2), y: city.y + Math.floor(city.h / 2) + 2 },
      { role: "weapon", x: city.x + 5, y: city.y + 4 },
      { role: "armor", x: city.x + city.w - 6, y: city.y + 4 },
      { role: "healer", x: city.x + city.w - 6, y: city.y + city.h - 4 }
    ];
    for (const n of npcSpawns) {
      const key = `npc_${n.role}`;
      const o = this.physics.add.sprite(n.x * this.ts + this.ts / 2, n.y * this.ts + this.ts / 2, key);
      o.body.setImmovable(true);
      o.body.moves = false;
      o.setData("role", n.role);
      o.setData("name", NPC_TYPES[n.role]?.name || "Sehirli");
      this.npcs.push(o);
    }
  }

  pickMobForTile(tx, ty) {
    const city = this.s.world.city;
    const cx = city ? city.x + city.w / 2 : this.s.world.spawn.x;
    const cy = city ? city.y + city.h / 2 : this.s.world.spawn.y;
    const d = Math.hypot(tx - cx, ty - cy);
    const maxLv = d > 34 ? 5 : d > 24 ? 4 : d > 16 ? 3 : 2;
    const list = ENEMIES.filter((e) => e.lv <= maxLv);
    return { ...(Phaser.Utils.Array.GetRandom(list.length ? list : ENEMIES)) };
  }

  spawnMobs() {
    for (let i = 0; i < MOB_COUNT; i++) {
      const p = this.randomWalkTile(true);
      const enemy = this.pickMobForTile(p.tx, p.ty);
      this.spawnMobAt(p.tx, p.ty, enemy);
    }
  }

  spawnMobAt(tx, ty, enemy) {
    const m = this.mobs.create(tx * this.ts + this.ts / 2, ty * this.ts + this.ts / 2, `mob_${enemy.id}`);
    m.setData("enemy", { ...enemy });
    m.setData("hp", enemy.hp);
    m.setData("nextMove", 0);
    m.setData("hitCd", 0);
    m.body.setSize(10, 10, true);
    m.setCollideWorldBounds(true);
    return m;
  }

  respawnMob(enemyId) {
    const p = this.randomWalkTile(true);
    const enemy = ENEMIES.find((e) => e.id === enemyId) || this.pickMobForTile(p.tx, p.ty);
    this.spawnMobAt(p.tx, p.ty, enemy);
  }

  updateMobs(time) {
    for (const m of this.mobs.getChildren()) {
      if (!m.active) continue;
      const next = m.getData("nextMove") || 0;
      if (time < next) continue;
      const e = m.getData("enemy");
      const sp = 34 + e.lv * 8;
      const dirs = [
        { x: 0, y: 0 },
        { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 0, y: 1 }, { x: 0, y: -1 }
      ];
      const d = Phaser.Utils.Array.GetRandom(dirs);
      m.setVelocity(d.x * sp, d.y * sp);
      m.setData("nextMove", time + rint(700, 1700));
    }
  }

  nearestNpc(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y);
      if (d <= bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  nearestMob(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const m of this.mobs.getChildren()) {
      if (!m.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y);
      if (d <= bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  }

  interactNpc(npc) {
    const role = npc.getData("role");
    if (this.domNpc?.visible) this.closeNpcDialog();
    if (role === "quest") return this.openQuestDialog();
    if (role === "weapon" || role === "armor" || role === "healer") return this.openShopDialog(role);
    this.openNpcDialog(npc.getData("name") || "Sehirli", "Merhaba gezgin.", () => {
      this.addNpcDialogButton("Kapat", () => this.closeNpcDialog());
    });
  }

  startMobBattle(mob) {
    if (!mob || !mob.active) return;
    if (this.time.now < this.lockEncounter) return;
    const enemy = { ...mob.getData("enemy") };
    mob.destroy();
    this.time.delayedCall(rint(10000, 18000), () => this.respawnMob(enemy.id));
    this.beginBattle(enemy, "mob");
  }

  onMobTouch(_, mob) {
    if (!mob?.active) return;
    const now = this.time.now;
    const cd = mob.getData("hitCd") || 0;
    if (now < cd) return;
    mob.setData("hitCd", now + 900);
    const e = mob.getData("enemy") || ENEMIES[0];
    const taken = dmg(e.atk, this.defVal(), 0.78, 1.05);
    this.s.p.hp = Math.max(1, this.s.p.hp - taken);
    this.refreshUi();
    if (now - this.lastHurtToastAt > 1100) {
      this.lastHurtToastAt = now;
      this.toast(`${e.n} vurdu: -${taken} CAN`, 900);
    }
  }

  tryAreaAttack() {
    if (this.invOpen || this.domMap?.visible || this.domNpc?.visible || this.domQuest?.visible) return;
    const now = this.time.now;
    if (now - this.lastAttackAt < ATTACK_COOLDOWN_MS) return;
    this.lastAttackAt = now;

    const r = ATTACK_RADIUS + this.sk("flow") * 5;
    const rr = r * r;
    let hitCount = 0;
    let killCount = 0;
    let totalExp = 0;
    let totalGold = 0;
    let potDrop = 0;

    for (const m of this.mobs.getChildren()) {
      if (!m.active) continue;
      const dx = m.x - this.player.x;
      const dy = m.y - this.player.y;
      if (dx * dx + dy * dy > rr) continue;
      const e = m.getData("enemy") || ENEMIES[0];
      const raw = dmg(this.atkVal(), e.def, 0.88, 1.18);
      const hp = (m.getData("hp") || e.hp) - raw;
      hitCount += 1;
      if (hp > 0) {
        m.setData("hp", hp);
        continue;
      }
      killCount += 1;
      this.tryProgressQuest("kill", e.id, 1);
      m.destroy();
      this.time.delayedCall(rint(9000, 16000), () => this.respawnMob(e.id));
      const bonusRate = 1 + this.sk("flow") * 0.12;
      totalExp += Math.max(1, Math.floor((e.exp + Phaser.Math.Between(0, 3)) * bonusRate));
      totalGold += Math.max(1, Math.floor((e.gold + Phaser.Math.Between(0, 4)) * bonusRate));
      if (Math.random() < 0.18 + this.sk("flow") * 0.04) potDrop += 1;
    }

    this.hitFx.clear();
    this.hitFx.lineStyle(2, 0xffb703, 0.95);
    this.hitFx.strokeCircle(this.player.x, this.player.y, r);
    this.tweens.add({
      targets: this.hitFx,
      alpha: 0,
      duration: 130,
      yoyo: false,
      onComplete: () => this.hitFx.clear().setAlpha(1)
    });

    if (hitCount <= 0) {
      this.toast("Menzilde yaratik yok.", 700);
      return;
    }

    if (killCount > 0) {
      this.s.gold += totalGold;
      this.grantExp(totalExp);
      this.s.inv.pot += potDrop;
      this.refreshUi();
      this.refreshInv();
      this.saveGame();
      this.toast(`Vurus: ${hitCount} isabet / ${killCount} oldurme  +${totalExp} TECR +${totalGold}G`, 1400);
      return;
    }

    this.toast(`${hitCount} yaratik isabet aldi.`, 900);
  }

  makeTouch() {
    this.touch = this.sys.game.device.input.touch;
    this.j = { on: false, id: -1, bx: 88, by: this.scale.height - 88, r: 42, x: 0, y: 0 };
    this.jBase = this.add.circle(this.j.bx, this.j.by, 40, 0x000000, 0.26).setScrollFactor(0).setDepth(2100);
    this.jKnob = this.add.circle(this.j.bx, this.j.by, 18, 0xffffff, 0.32).setScrollFactor(0).setDepth(2101);
    this.btnAct = this.mkBtn("ETK", 90, 46, 0x2f855a, () => this.interact());
    this.btnAtk = this.mkBtn("SAL", 74, 38, 0xb91c1c, () => this.tryAreaAttack(), 12);
    this.btnBag = this.mkBtn("CANTA", 78, 40, 0x2563eb, () => this.toggleInv(), 11);
    this.btnMap = this.mkBtn("HARITA", 74, 34, 0x334155, () => this.toggleMinimap(), 11);
    this.btnQuest = this.mkBtn("GOREV", 74, 34, 0x7c3aed, () => this.toggleQuest(), 10);
    this.btnAct.c.setScrollFactor(0).setDepth(2102);
    this.btnAtk.c.setScrollFactor(0).setDepth(2102);
    this.btnBag.c.setScrollFactor(0).setDepth(2102);
    this.btnMap.c.setScrollFactor(0).setDepth(2102).setAlpha(0.95);
    this.btnQuest.c.setScrollFactor(0).setDepth(2102).setAlpha(0.95);
    if (!this.touch) [this.jBase, this.jKnob, this.btnAct.c, this.btnAtk.c, this.btnBag.c, this.btnMap.c, this.btnQuest.c].forEach((o) => o.setVisible(false));

    this.pDown = (p) => {
      if (!this.touch || this.invOpen || this.j.on) return;
      if (p.x > this.scale.width * 0.48 || p.y < this.scale.height * 0.45) return;
      this.j.on = true; this.j.id = p.id; this.j.bx = p.x; this.j.by = p.y; this.j.x = 0; this.j.y = 0;
      this.jBase.setPosition(p.x, p.y); this.jKnob.setPosition(p.x, p.y);
    };
    this.pMove = (p) => {
      if (!this.j.on || p.id !== this.j.id) return;
      const dx = p.x - this.j.bx, dy = p.y - this.j.by, dist = Math.hypot(dx, dy);
      if (dist < 0.001) { this.j.x = 0; this.j.y = 0; this.jKnob.setPosition(this.j.bx, this.j.by); return; }
      const len = Math.min(dist, this.j.r), nx = dx / dist, ny = dy / dist;
      this.j.x = (nx * len) / this.j.r; this.j.y = (ny * len) / this.j.r;
      this.jKnob.setPosition(this.j.bx + nx * len, this.j.by + ny * len);
    };
    this.pUp = (p) => {
      if (!this.j.on || p.id !== this.j.id) return;
      this.j.on = false; this.j.id = -1; this.j.x = 0; this.j.y = 0; this.jKnob.setPosition(this.j.bx, this.j.by);
    };
    this.input.on("pointerdown", this.pDown);
    this.input.on("pointermove", this.pMove);
    this.input.on("pointerup", this.pUp);
    this.input.on("pointerupoutside", this.pUp);
  }

  mkBtn(label, w, h, col, fn, fs = 14) {
    const c = this.add.container(0, 0);
    const b = this.add.rectangle(0, 0, w, h, col, 0.88).setStrokeStyle(2, 0xffffff, 0.25);
    const t = this.add.text(0, 0, label, { fontFamily: "Verdana, sans-serif", fontSize: `${fs}px`, color: "#fff", fontStyle: "bold" }).setOrigin(0.5);
    c.add([b, t]); c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.on("pointerdown", () => { b.setFillStyle(col, 1); fn(); });
    c.on("pointerup", () => b.setFillStyle(col, 0.88));
    c.on("pointerout", () => b.setFillStyle(col, 0.88));
    return { c, b, t };
  }

  layout() {
    const pad = 12, w = this.scale.width, h = this.scale.height;
    const barW = clamp(Math.floor(w * 0.28), 170, 300);
    this.hudBarInnerW = Math.max(1, barW - 4);
    this.txtStats.setPosition(pad, pad);
    this.hpBarBg.setPosition(pad, pad + 34).setSize(barW, 14);
    this.hpBarFill.setPosition(pad + 2, pad + 36).setSize(this.hudBarInnerW, 10);
    this.expBarBg.setPosition(pad, pad + 52).setSize(barW, 12);
    this.expBarFill.setPosition(pad + 2, pad + 54).setSize(this.hudBarInnerW, 8);
    this.txtHpBar.setPosition(pad + barW / 2, pad + 41);
    this.txtExpBar.setPosition(pad + barW / 2, pad + 59);
    this.txtQuest.setPosition(pad, pad + 70);
    this.txtKeys.setPosition(w - pad, 144);
    this.txtHint.setPosition(w / 2, h - 20);
    this.txtToast.setPosition(w / 2, 24);
    this.invBg.setSize(w, h);
    const cx = w / 2, cy = h / 2;
    const baseW = 340, baseH = 300;
    const s = Math.min((w - 12) / baseW, (h - 12) / baseH, 1);
    const pw = baseW * s, ph = baseH * s;
    const top = cy - ph / 2;
    const left = cx - pw / 2;
    this.invPanel.setPosition(cx, cy).setSize(pw, ph);
    this.invTitle.setScale(s).setPosition(cx, top + 14 * s);
    this.btnClose.c.setScale(s).setPosition(cx + (baseW / 2 - 16) * s, top + 14 * s);
    this.btnPage.c.setScale(s).setPosition(cx - (baseW / 2 - 48) * s, top + 14 * s);
    this.invTxt.setScale(s).setPosition(left + 8 * s, top + 30 * s);
    this.statTxt.setScale(s).setPosition(left + 8 * s, top + 88 * s);
    this.btnStr.c.setScale(s).setPosition(cx - 70 * s, top + 168 * s);
    this.btnVit.c.setScale(s).setPosition(cx, top + 168 * s);
    this.btnAgi.c.setScale(s).setPosition(cx + 70 * s, top + 168 * s);
    this.skillTxt.setScale(s).setPosition(left + 8 * s, top + 84 * s);
    this.btnSkillPower.c.setScale(s).setPosition(cx - 72 * s, top + 216 * s);
    this.btnSkillSkin.c.setScale(s).setPosition(cx + 72 * s, top + 216 * s);
    this.btnSkillMedic.c.setScale(s).setPosition(cx - 72 * s, top + 246 * s);
    this.btnSkillFlow.c.setScale(s).setPosition(cx + 72 * s, top + 246 * s);
    if (!this.j.on) { this.j.bx = 88; this.j.by = h - 88; this.jBase.setPosition(this.j.bx, this.j.by); this.jKnob.setPosition(this.j.bx, this.j.by); }
    this.btnAct.c.setPosition(w - 76, h - 76);
    this.btnAtk.c.setPosition(w - 76, h - 122);
    this.btnBag.c.setPosition(w - 64, 42);
    this.btnMap.c.setPosition(w - 66, 84);
    this.btnQuest.c.setPosition(w - 66, 126);
    if (this.minimap?.c) this.minimap.c.setPosition(w - this.minimap.boxW - 12, 12);
    this.refreshHudBars();
  }

  toggleInv(force) {
    const on = typeof force === "boolean" ? force : !this.invOpen;
    if (on && this.questOpen) this.toggleQuest(false);
    if (on && this.domMap?.visible) this.toggleMinimap(false);
    if (on && this.domNpc?.visible) this.closeNpcDialog();
    this.invOpen = on;
    [this.invBg, this.invPanel, this.invTitle, this.invTxt, this.statTxt, this.skillTxt, ...this.invControls].forEach((o) => o.setVisible(false));
    if (this.domInv) this.domInv.overlay.style.display = on ? "flex" : "none";
    if (on) this.refreshInv();
  }

  toggleInvPage() {
    this.invPage = this.invPage === 0 ? 1 : 0;
    this.refreshInv();
  }

  refreshInv() {
    const p = this.s.p;
    const canPower = this.canLearn("power").ok;
    const canSkin = this.canLearn("skin").ok;
    const canMedic = this.canLearn("medic").ok;
    const canFlow = this.canLearn("flow").ok;

    this.invTxt.setText(
      `G:${this.s.gold}  P:${this.s.inv.pot}  W:${this.s.inv.wood}  S:${this.s.inv.stone}\n` +
      `Stat Puan: ${p.pts}   Yetenek Puan: ${p.skp}\n` +
      `SIL Sev${this.s.shop.weaponLv} (${this.weaponCost()}g)  ZIR Sev${this.s.shop.armorLv} (${this.armorCost()}g)\n` +
      `Tuslar: E etkilesim, SPACE saldiri, Q gorev, I envanter, M harita`
    );

    this.statTxt.setText(
      "Istatistikler\n" +
      `SAL ${this.s.p.atk}  SAV ${this.s.p.def}  HIZ ${this.s.p.speed}\n` +
      `CAN ${this.s.p.hp}/${this.s.p.max}\n` +
      `STR ${this.s.p.str}  VIT ${this.s.p.vit}  AGI ${this.s.p.agi}`
    );

    this.skillTxt.setText(
      "Yetenekler\n" +
      `Guc ${this.sk("power")}/${SKILLS.power.max}  (SAL+)\n` +
      `Deri ${this.sk("skin")}/${SKILLS.skin.max}  (SAV+)\n` +
      `Sifa ${this.sk("medic")}/${SKILLS.medic.max}  (Guc 1 gerekli)\n` +
      `Akim ${this.sk("flow")}/${SKILLS.flow.max}  (Guc 2 + Deri 1 gerekli)`
    );

    const statPage = this.invPage === 0;
    this.btnPage.t.setText(statPage ? "YETENEK" : "ISTAT");

    if (this.domInv) {
      this.domInv.pageBtn.textContent = statPage ? "YETENEK" : "ISTAT";
      this.domInv.summary.textContent =
        `G:${this.s.gold}  P:${this.s.inv.pot}  W:${this.s.inv.wood}  S:${this.s.inv.stone}\n` +
        `Stat Puan: ${p.pts}   Yetenek Puan: ${p.skp}`;
      this.domInv.stats.textContent =
        "Istatistikler\n" +
        `SAL ${this.s.p.atk}  SAV ${this.s.p.def}  HIZ ${this.s.p.speed}\n` +
        `CAN ${this.s.p.hp}/${this.s.p.max}\n` +
        `STR ${this.s.p.str}  VIT ${this.s.p.vit}  AGI ${this.s.p.agi}`;
      this.domInv.skills.textContent =
        "Yetenekler\n" +
        `Guc ${this.sk("power")}/${SKILLS.power.max}  (SAL+)\n` +
        `Deri ${this.sk("skin")}/${SKILLS.skin.max}  (SAV+)\n` +
        `Sifa ${this.sk("medic")}/${SKILLS.medic.max}  (Guc 1 gerekli)\n` +
        `Akim ${this.sk("flow")}/${SKILLS.flow.max}  (Guc 2 + Deri 1 gerekli)\n` +
        "Sehir NPC: Silah, Zirh, Sifaci, Gorev Ustasi";
      this.domInv.stats.style.display = statPage ? "block" : "none";
      this.domInv.statRow.style.display = statPage ? "flex" : "none";
      this.domInv.skills.style.display = statPage ? "none" : "block";
      this.domInv.skillGrid.style.display = statPage ? "none" : "grid";
      this.domInv.statBtns.strBtn.disabled = p.pts <= 0;
      this.domInv.statBtns.vitBtn.disabled = p.pts <= 0;
      this.domInv.statBtns.agiBtn.disabled = p.pts <= 0;
      this.domInv.skillBtns.powerBtn.disabled = !canPower;
      this.domInv.skillBtns.skinBtn.disabled = !canSkin;
      this.domInv.skillBtns.medicBtn.disabled = !canMedic;
      this.domInv.skillBtns.flowBtn.disabled = !canFlow;
    }

    const statOn = p.pts > 0;
    this.btnStr.c.setAlpha(statOn ? 1 : 0.45);
    this.btnVit.c.setAlpha(statOn ? 1 : 0.45);
    this.btnAgi.c.setAlpha(statOn ? 1 : 0.45);
    this.btnSkillPower.c.setAlpha(canPower ? 1 : 0.45);
    this.btnSkillSkin.c.setAlpha(canSkin ? 1 : 0.45);
    this.btnSkillMedic.c.setAlpha(canMedic ? 1 : 0.45);
    this.btnSkillFlow.c.setAlpha(canFlow ? 1 : 0.45);
  }

  refreshHudBars() {
    if (!this.hpBarFill || !this.expBarFill) return;
    const p = this.s.p;
    const fullW = Math.max(1, this.hudBarInnerW || 1);
    const hpRate = clamp(p.hp / Math.max(1, p.max), 0, 1);
    const expRate = clamp(p.exp / Math.max(1, p.next), 0, 1);
    const hpW = Math.round(fullW * hpRate);
    const expW = Math.round(fullW * expRate);
    this.hpBarFill.setDisplaySize(hpW, 10);
    this.expBarFill.setDisplaySize(expW, 8);
    this.txtHpBar.setText(`HP ${p.hp}/${p.max}`);
    this.txtExpBar.setText(`EXP ${p.exp}/${p.next}  SEV ${p.lv}`);
  }

  refreshUi() {
    const p = this.s.p;
    this.txtStats.setText(
      `SEV ${p.lv}  SAL ${this.atkVal()}  SAV ${this.defVal()}  ALTIN ${this.s.gold}\n` +
      `SIL ${this.s.shop.weaponLv}  ZIR ${this.s.shop.armorLv}  STAT ${p.pts}  YET ${p.skp}`
    );
    this.refreshHudBars();
    const q = this.s.q;
    if (!q.accepted) {
      this.txtQuest.setText("Gorev: Gorev Ustasi ile konus\n(Sehir merkezinde E'ye bas)");
    } else if (q.done) {
      this.txtQuest.setText(`${q.t}\nTeslime hazir (${q.prog}/${q.tar})`);
    } else {
      this.txtQuest.setText(`${q.t}\nIlerleme: ${q.prog}/${q.tar}  Odul: ${q.reward} Altin`);
    }
    this.refreshQuestPanel();
  }

  toast(msg, ms = 1600) {
    this.twnToast?.remove();
    this.txtToast.setText(msg).setAlpha(1).setVisible(true);
    this.twnToast = this.tweens.add({ targets: this.txtToast, alpha: 0, delay: ms, duration: 280, onComplete: () => this.txtToast.setVisible(false).setAlpha(1) });
  }

  interact() {
    if (this.time.now - this.lastInteract < 200) return;
    this.lastInteract = this.time.now;
    const t = this.facing();
    if (t && (t.tile === T.TR || t.tile === T.ST)) return this.harvest(t);
    const npc = this.nearestNpc(this.ts * 2.2);
    if (npc) return this.interactNpc(npc);
    this.toast("Etkilesecek bir sey yok.", 1000);
  }

  talk() {
    const npc = this.nearestNpc(this.ts * 2.2);
    if (!npc) return this.toast("Yakinlarda kimse yok.", 1000);
    this.interactNpc(npc);
  }

  harvest(t) {
    if (t.tile === T.TR) {
      this.s.inv.wood += 1;
      this.tryProgressQuest("collect", "wood", 1);
      this.toast("+1 Odun");
    } else { this.s.inv.stone += 1; this.tryProgressQuest("collect", "stone", 1); this.toast("+1 Tas"); }
    this.map[t.y][t.x] = T.G;
    this.drawTile(t.x, t.y, T.G);
    this.drawMinimapBase();
    this.findRes(t.x, t.y)?.destroy();
    const d = Math.max(8000, (t.tile === T.TR ? 34000 : 28000) + rint(-7000, 7000));
    this.scheduleRespawn(t.x, t.y, t.tile, d);
    this.refreshUi();
    this.refreshInv();
    this.saveGame();
  }

  grantExp(n) {
    const p = this.s.p;
    p.exp += Math.max(0, n);
    let up = false;
    while (p.exp >= p.next) {
      p.exp -= p.next;
      p.lv += 1;
      p.next = Math.floor(p.next * 1.35 + 8);
      p.max += 2;
      p.atk += 1;
      p.def += 1;
      p.hp = p.max;
      p.pts += 3;
      p.skp += 1;
      up = true;
    }
    if (up) this.toast(`Seviye atladin! Sev ${p.lv} (+3 Ozellik, +1 Yetenek)`, 2200);
  }

  resolveBattle(pl) {
    this.input.enabled = true;
    if (pl.result === "win") {
      const bonusRate = 1 + this.sk("flow") * 0.12;
      const expGain = Math.max(1, Math.floor(pl.exp * bonusRate));
      const goldGain = Math.max(1, Math.floor(pl.gold * bonusRate));
      this.s.gold += goldGain;
      this.grantExp(expGain);
      if (Math.random() < 0.18 + this.sk("flow") * 0.04) this.s.inv.pot += 1;
      if (pl.source === "mob") this.tryProgressQuest("kill", pl.enemyId || "any", 1);
      this.toast(`Kazandin: +${expGain} TECR +${goldGain} Altin`, 1900);
    }
    else if (pl.result === "lose") { const pen = Math.min(this.s.gold, 8); this.s.gold -= pen; this.s.p.hp = Math.max(1, Math.floor(this.s.p.max * 0.5)); this.toast(`Yenildin. ${pen} altin kaybettin.`, 1800); }
    else this.toast("Savastan kactin.", 1300);
    this.refreshUi(); this.refreshInv(); this.lockEncounter = this.time.now + this.cdEncounter; this.saveGame();
  }

  beginBattle(enemy, source = "wild") {
    if (this.scene.isActive("battle")) return;
    this.lockEncounter = this.time.now + this.cdEncounter;
    this.toggleInv(false);
    this.persistPlayer();
    this.player.setVelocity(0, 0);
    this.input.enabled = false;
    this.scene.launch("battle", { enemy: enemy || pickEnemy(this.s.p.lv), source });
    this.scene.pause();
  }

  update(time, delta) {
    let x = 0, y = 0;
    if (!this.invOpen) {
      if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;
      if (this.touch) { x += this.j.x; y += this.j.y; }
    }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    this.player.setVelocity(x * this.s.p.speed, y * this.s.p.speed);
    const vx = this.player.body.velocity.x, vy = this.player.body.velocity.y;
    if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
      this.player.last = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : (vy > 0 ? "down" : "up");
      this.player.anims.play(`walk_${this.player.last}`, true);
    } else this.player.anims.play(`idle_${this.player.last || "down"}`, true);

    const f = this.facing();
    const mob = this.nearestMob(this.ts * 1.4);
    const npc = this.nearestNpc(this.ts * 2.2);
    if (f && (f.tile === T.TR || f.tile === T.ST)) this.txtHint.setText("E / ETK: Topla").setVisible(true);
    else if (npc) this.txtHint.setText(`E / ETK: ${npc.getData("name")}`).setVisible(true);
    else if (mob) this.txtHint.setText("SPACE / SAL: Yakin yaratiklara vur").setVisible(true);
    else this.txtHint.setVisible(false);

    this.updateMobs(time);
    this.updateMinimapDynamic();
  }

  facing() {
    const px = Math.floor(this.player.x / this.ts), py = Math.floor(this.player.y / this.ts), d = this.player.last || "down";
    let tx = px, ty = py;
    if (d === "up") ty -= 1; if (d === "down") ty += 1; if (d === "left") tx -= 1; if (d === "right") tx += 1;
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
    return { x: tx, y: ty, tile: this.map[ty][tx] };
  }

  persistPlayer() {
    this.s.world.player = { x: clamp(Math.floor(this.player.x / this.ts), 0, this.w - 1), y: clamp(Math.floor(this.player.y / this.ts), 0, this.h - 1), d: this.player.last || "down" };
  }

  saveGame() { this.persistPlayer(); saveState(this.s); }

  scheduleRespawn(x, y, tile, delay) {
    const key = `${x},${y}`; if (this.respawn.has(key)) return;
    this.respawn.set(key, this.time.addEvent({
      delay, callback: () => {
        this.respawn.delete(key);
        if (this.map[y][x] !== T.G) return;
        this.map[y][x] = tile;
        this.drawTile(x, y, tile);
        this.drawMinimapBase();
        const o = this.add.rectangle(x * this.ts + this.ts / 2, y * this.ts + this.ts / 2, this.ts, this.ts, 0x000000, 0);
        o._x = x; o._y = y;
        this.physics.add.existing(o, true); this.res.add(o);
      }
    }));
  }

  findRes(x, y) {
    for (const o of this.res.getChildren()) if (o._x === x && o._y === y) return o;
    return null;
  }

  drawMap() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.drawTile(x, y, this.map[y][x]);
    this.g.setDepth(-10);
  }

  drawTile(x, y, t) {
    const px = x * this.ts, py = y * this.ts;
    this.g.fillStyle(0x103122, 1).fillRect(px, py, this.ts, this.ts);
    if (((x * 17 + y * 13) % 5) === 0) this.g.fillStyle(0x15422c, 1).fillRect(px + 3, py + 3, 1, 1);
    if (t === T.R) { this.g.fillStyle(0x8b6b3f, 1).fillRect(px, py, this.ts, this.ts); this.g.fillStyle(0xa68455, 1).fillRect(px, py, this.ts, 2); }
    else if (t === T.W) { this.g.fillStyle(0x1c4f8a, 1).fillRect(px, py, this.ts, this.ts); this.g.fillStyle(0x2f6db5, 1).fillRect(px, py, this.ts, 2); }
    else if (t === T.TR) { this.g.fillStyle(0x6b4a2b, 1).fillRect(px + 7, py + 8, 2, 6); this.g.fillStyle(0x2f7d3a, 1).fillRect(px + 3, py + 2, this.ts - 6, 8); }
    else if (t === T.WL) { this.g.fillStyle(0x6c4a3a, 1).fillRect(px, py, this.ts, this.ts); this.g.fillStyle(0x8a5d48, 1).fillRect(px, py, this.ts, 2); }
    else if (t === T.ST) { this.g.fillStyle(0x6b7280, 1).fillRect(px, py, this.ts, this.ts); this.g.fillStyle(0x8b93a1, 1).fillRect(px + 2, py + 3, this.ts - 4, 3); }
    else if (t === T.P) {
      this.g.fillStyle(0x8b95a5, 1).fillRect(px, py, this.ts, this.ts);
      this.g.fillStyle(0xaeb8c7, 1).fillRect(px, py, this.ts, 2);
      this.g.fillStyle(0x758095, 1).fillRect(px + 1, py + 9, this.ts - 2, 1);
    }
    else if (t === T.F) {
      this.g.fillStyle(0x1b4b2d, 1).fillRect(px, py, this.ts, this.ts);
      this.g.fillStyle(0x2f6a3d, 1).fillRect(px + 3, py + 4, 2, 2);
      this.g.fillStyle(0x3b7f4b, 1).fillRect(px + 9, py + 10, 2, 2);
    }
  }

  buildColliders() {
    const solid = new Set([T.W, T.WL]);
    for (let y = 0; y < this.h; y++) {
      let st = -1;
      for (let x = 0; x <= this.w; x++) {
        const s = x < this.w && solid.has(this.map[y][x]);
        if (s && st === -1) st = x;
        if ((!s || x === this.w) && st !== -1) {
          const len = x - st;
          const o = this.add.rectangle(st * this.ts + (len * this.ts) / 2, y * this.ts + this.ts / 2, len * this.ts, this.ts, 0x000000, 0);
          this.physics.add.existing(o, true); this.walls.add(o); st = -1;
        }
      }
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const t = this.map[y][x]; if (t !== T.TR && t !== T.ST) continue;
      const o = this.add.rectangle(x * this.ts + this.ts / 2, y * this.ts + this.ts / 2, this.ts, this.ts, 0x000000, 0);
      o._x = x; o._y = y; this.physics.add.existing(o, true); this.res.add(o);
    }
  }

  makeWorld() {
    const map = Array.from({ length: this.h }, () => Array(this.w).fill(T.G));
    const city = { w: 24, h: 14 };
    city.x = Math.floor(this.w / 2 - city.w / 2);
    city.y = Math.floor(this.h / 2 - city.h / 2);
    const cx = city.x + Math.floor(city.w / 2);
    const cy = city.y + Math.floor(city.h / 2);

    const inB = (x, y) => x > 1 && y > 1 && x < this.w - 2 && y < this.h - 2;
    const inCity = (x, y) => x >= city.x && x < city.x + city.w && y >= city.y && y < city.y + city.h;
    const setTile = (x, y, t) => { if (inB(x, y)) map[y][x] = t; };
    const clearWalk = (x, y) => {
      if (!inB(x, y)) return;
      if (map[y][x] === T.W || map[y][x] === T.WL) return;
      map[y][x] = T.R;
    };

    for (let i = 0; i < 450; i++) {
      const x = rint(2, this.w - 3);
      const y = rint(2, this.h - 3);
      if (!inCity(x, y) && map[y][x] === T.G && Math.random() < 0.4) map[y][x] = T.F;
    }

    const pond = (px, py, rx, ry) => {
      for (let y = -ry; y <= ry; y++) {
        for (let x = -rx; x <= rx; x++) {
          const xx = px + x;
          const yy = py + y;
          if (!inB(xx, yy) || inCity(xx, yy)) continue;
          if ((x * x) / (rx * rx + 0.01) + (y * y) / (ry * ry + 0.01) <= 1) map[yy][xx] = T.W;
        }
      }
    };
    pond(Math.floor(this.w * 0.13), Math.floor(this.h * 0.16), 4, 3);
    pond(Math.floor(this.w * 0.87), Math.floor(this.h * 0.84), 4, 3);

    for (let y = city.y; y < city.y + city.h; y++) {
      for (let x = city.x; x < city.x + city.w; x++) {
        map[y][x] = T.P;
      }
    }

    for (let x = 2; x < this.w - 2; x++) if (map[cy][x] !== T.W) map[cy][x] = T.R;
    for (let y = 2; y < this.h - 2; y++) if (map[y][cx] !== T.W) map[y][cx] = T.R;
    for (let x = city.x - 1; x <= city.x + city.w; x++) {
      clearWalk(x, city.y - 1);
      clearWalk(x, city.y + city.h);
    }
    for (let y = city.y - 1; y <= city.y + city.h; y++) {
      clearWalk(city.x - 1, y);
      clearWalk(city.x + city.w, y);
    }

    const placeBuilding = (bx, by, bw, bh, doorX, doorY) => {
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          if (!inB(x, y)) continue;
          map[y][x] = T.WL;
        }
      }
      for (let y = by + 1; y < by + bh - 1; y++) {
        for (let x = bx + 1; x < bx + bw - 1; x++) {
          if (!inB(x, y)) continue;
          map[y][x] = T.P;
        }
      }
      setTile(doorX, doorY, T.R);
      clearWalk(doorX, doorY + 1);
    };

    placeBuilding(city.x + 2, city.y + 2, 7, 6, city.x + 5, city.y + 7);
    placeBuilding(city.x + city.w - 9, city.y + 2, 7, 6, city.x + city.w - 6, city.y + 7);
    placeBuilding(cx - 3, city.y + city.h - 8, 7, 6, cx, city.y + city.h - 3);

    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) clearWalk(x, y);
    }

    const patch = (tile, x0, x1, y0, y1, count) => {
      const minX = clamp(Math.min(x0, x1), 2, this.w - 3);
      const maxX = clamp(Math.max(x0, x1), 2, this.w - 3);
      const minY = clamp(Math.min(y0, y1), 2, this.h - 3);
      const maxY = clamp(Math.max(y0, y1), 2, this.h - 3);
      for (let i = 0; i < count; i++) {
        const x = rint(minX, maxX);
        const y = rint(minY, maxY);
        if (inCity(x, y)) continue;
        if (map[y][x] === T.G || map[y][x] === T.F) map[y][x] = tile;
      }
    };
    patch(T.TR, 2, city.x - 4, 4, this.h - 5, 230);
    patch(T.TR, city.x + city.w + 3, this.w - 3, 4, this.h - 5, 230);
    patch(T.ST, 4, this.w - 5, 2, city.y - 4, 150);
    patch(T.ST, 4, this.w - 5, city.y + city.h + 3, this.h - 3, 150);

    const npcs = [
      { role: "quest", x: cx, y: cy },
      { role: "weapon", x: city.x + 5, y: city.y + 8 },
      { role: "armor", x: city.x + city.w - 6, y: city.y + 8 },
      { role: "healer", x: cx, y: city.y + city.h - 4 }
    ];

    return {
      ver: WORLD_VERSION,
      map,
      city,
      npcs,
      spawn: { x: cx, y: cy + 5 },
      player: { x: cx, y: cy + 5, d: "down" }
    };
  }

  makePlayerTex() {
    if (this.textures.exists("p_down_0")) return;
    const d = (k, dir, st) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x8fd3ff, 1).fillRect(3, 5, 6, 7);
      g.fillStyle(0xffe0bd, 1).fillRect(4, 2, 4, 3);
      g.fillStyle(0x2b2b2b, 1).fillRect(4, 1, 4, 1);
      g.fillStyle(0x000000, 0.9);
      if (dir === "down") { g.fillRect(5, 3, 1, 1); g.fillRect(7, 3, 1, 1); } else if (dir === "left") g.fillRect(5, 3, 1, 1); else if (dir === "right") g.fillRect(7, 3, 1, 1);
      g.fillStyle(0x243447, 1);
      const s = st ? 1 : 0;
      g.fillRect(4, 12, 2, 3 + s); g.fillRect(6, 12, 2, 3 + (1 - s));
      g.generateTexture(k, 12, 16); g.destroy();
    };
    ["down", "up", "left", "right"].forEach((dir) => {
      d(`p_${dir}_0`, dir, 0); d(`p_${dir}_1`, dir, 1);
      this.anims.create({ key: `walk_${dir}`, frames: [{ key: `p_${dir}_0` }, { key: `p_${dir}_1` }], frameRate: 8, repeat: -1 });
      this.anims.create({ key: `idle_${dir}`, frames: [{ key: `p_${dir}_0` }], frameRate: 1, repeat: -1 });
    });
  }

  makeNpcTex() {
    for (const role of Object.keys(NPC_TYPES)) {
      const key = `npc_${role}`;
      if (this.textures.exists(key)) continue;
      const col = NPC_TYPES[role].color;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xf0d2b4, 1).fillRect(4, 2, 4, 3);
      g.fillStyle(col, 1).fillRect(3, 5, 6, 8);
      g.fillStyle(0x111827, 1).fillRect(4, 13, 2, 3).fillRect(6, 13, 2, 3);
      g.fillStyle(0xffffff, 0.45).fillRect(4, 6, 4, 1);
      g.generateTexture(key, 12, 16);
      g.destroy();
    }
  }
}

class BattleScene extends Phaser.Scene {
  constructor() { super("battle"); this.turn = "player"; this.busy = false; this.done = false; this.enabled = true; }
  init(data) {
    const d = data || {};
    this.e = { ...(d.enemy || ENEMIES[0]) };
    this.source = d.source || "wild";
  }

  create() {
    this.w = this.scene.get("world");
    this.s = this.w.s;
    this.ehp = this.e.hp;
    this.pGuard = false;
    this.eGuard = false;
    this.dim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x030712, 0.88).setOrigin(0, 0);
    this.panel = this.add.rectangle(0, 0, 520, 320, 0x0f172a, 0.92).setStrokeStyle(2, 0xffffff, 0.22);
    this.pc = this.add.rectangle(0, 0, 180, 120, 0x10223d, 0.9).setStrokeStyle(2, 0xffffff, 0.14);
    this.ec = this.add.rectangle(0, 0, 180, 120, 0x3b1a1a, 0.9).setStrokeStyle(2, 0xffffff, 0.14);
    this.ep = this.add.rectangle(0, 0, 56, 56, this.e.c, 1).setStrokeStyle(2, 0xffffff, 0.35);
    const sty = { fontFamily: "Verdana, sans-serif", color: "#fff" };
    this.tP = this.add.text(0, 0, "Oyuncu", { ...sty, fontSize: "16px", fontStyle: "bold" }).setOrigin(0.5);
    this.tE = this.add.text(0, 0, this.e.n, { ...sty, fontSize: "16px", fontStyle: "bold" }).setOrigin(0.5);
    this.iP = this.add.text(0, 0, "", { ...sty, color: "#e5e7eb", fontSize: "13px", align: "center" }).setOrigin(0.5);
    this.iE = this.add.text(0, 0, "", { ...sty, color: "#e5e7eb", fontSize: "13px", align: "center" }).setOrigin(0.5);
    this.log = this.add.text(0, 0, "", { ...sty, color: "#f8fafc", fontSize: "13px", align: "center", wordWrap: { width: 520 } }).setOrigin(0.5);
    this.bs = [this.btn("Saldir", 0xb91c1c, "atk"), this.btn("Korun", 0x1d4ed8, "guard"), this.btn("Iksir", 0x15803d, "pot"), this.btn("Kac", 0x6b7280, "run")];
    this.keys = this.input.keyboard.addKeys("ONE,TWO,THREE,FOUR");
    this.k1 = () => this.act("atk"); this.k2 = () => this.act("guard"); this.k3 = () => this.act("pot"); this.k4 = () => this.act("run");
    this.keys.ONE.on("down", this.k1); this.keys.TWO.on("down", this.k2); this.keys.THREE.on("down", this.k3); this.keys.FOUR.on("down", this.k4);
    this.scale.on("resize", this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.layout(); this.refresh(); this.setLog(`${this.e.n} saldiriya gecti!`);
  }

  sk(id) { return this.s.skills?.[id] || 0; }
  atkVal() { return this.s.p.atk + this.sk("power"); }
  defVal() { return this.s.p.def + this.sk("skin"); }
  potionHeal() { return 16 + this.sk("medic") * 4; }
  runChance() { return 0.45 + this.sk("flow") * 0.08; }

  shutdown() {
    this.scale.off("resize", this.layout, this);
    this.keys.ONE.off("down", this.k1); this.keys.TWO.off("down", this.k2); this.keys.THREE.off("down", this.k3); this.keys.FOUR.off("down", this.k4);
  }

  btn(label, col, a) {
    const c = this.add.container(0, 0), b = this.add.rectangle(0, 0, 120, 46, col, 0.92).setStrokeStyle(2, 0xffffff, 0.26);
    const t = this.add.text(0, 0, label, { fontFamily: "Verdana, sans-serif", fontSize: "14px", color: "#fff", fontStyle: "bold" }).setOrigin(0.5);
    c.add([b, t]); c.setSize(120, 46);
    c.setInteractive(new Phaser.Geom.Rectangle(-60, -23, 120, 46), Phaser.Geom.Rectangle.Contains);
    c.on("pointerdown", () => { b.setFillStyle(col, 1); this.act(a); });
    c.on("pointerup", () => b.setFillStyle(col, 0.92));
    c.on("pointerout", () => b.setFillStyle(col, 0.92));
    return { c, b };
  }

  layout() {
    const w = this.scale.width, h = this.scale.height, cx = w / 2;
    this.dim.setSize(w, h);
    const pw = Math.min(620, w - 18), ph = Math.min(340, h - 22);
    this.panel.setPosition(cx, h * 0.45).setSize(pw, ph);
    const y = this.panel.y - 74, lx = cx - pw * 0.23, rx = cx + pw * 0.23;
    this.pc.setPosition(lx, y); this.ec.setPosition(rx, y);
    this.tP.setPosition(lx, y - 42); this.tE.setPosition(rx, y - 42);
    this.iP.setPosition(lx, y + 16); this.iE.setPosition(rx, y + 20); this.ep.setPosition(rx, y - 6);
    this.log.setPosition(cx, this.panel.y + 8).setWordWrapWidth(pw - 28);
    const y1 = this.panel.y + ph * 0.32, y2 = y1 + 58, sx = Math.min(170, pw * 0.32);
    this.bs[0].c.setPosition(cx - sx / 2, y1); this.bs[1].c.setPosition(cx + sx / 2, y1); this.bs[2].c.setPosition(cx - sx / 2, y2); this.bs[3].c.setPosition(cx + sx / 2, y2);
  }

  setLog(t) { this.log.setText(t); }
  refresh() {
    this.iP.setText(`CAN ${this.s.p.hp}/${this.s.p.max}\nSAL ${this.atkVal()}  SAV ${this.defVal()}\n${this.pGuard ? "Korunuyor" : ""}`);
    this.iE.setText(`CAN ${this.ehp}/${this.e.hp}\nSAL ${this.e.atk}  SAV ${this.e.def}\n${this.eGuard ? "Korunuyor" : ""}`);
  }

  setEnabled(v) { this.enabled = v; this.bs.forEach((b) => b.c.setAlpha(v ? 1 : 0.55)); }

  act(a) {
    if (this.done || this.busy || !this.enabled || this.turn !== "player") return;
    this.busy = true;
    if (a === "atk") {
      let d = dmg(this.atkVal(), this.e.def, 0.9, 1.22);
      if (this.eGuard) { d = Math.max(1, Math.floor(d * 0.55)); this.eGuard = false; }
      this.ehp = Math.max(0, this.ehp - d); this.setLog(`${this.e.n} ${d} hasar aldi.`);
    } else if (a === "guard") { this.pGuard = true; this.setLog("Darbeye hazirlaniyorsun."); }
    else if (a === "pot") {
      if (this.s.inv.pot <= 0) { this.setLog("Iksirin kalmadi."); this.busy = false; return; }
      this.s.inv.pot -= 1; const heal = Math.min(this.potionHeal(), this.s.p.max - this.s.p.hp); this.s.p.hp += heal; this.setLog(`${heal} CAN yenilendi.`);
    } else if (a === "run") {
      if (Math.random() < this.runChance()) return this.finish({ result: "run" });
      this.setLog("Kacis basarisiz.");
    }
    this.refresh();
    if (this.ehp <= 0) return this.finish({ result: "win", exp: this.e.exp + Phaser.Math.Between(0, 3), gold: this.e.gold + Phaser.Math.Between(0, 4) });
    this.turn = "enemy"; this.time.delayedCall(500, () => this.enemyTurn());
  }

  enemyTurn() {
    if (this.done) return;
    const low = this.ehp <= Math.floor(this.e.hp * 0.35), guard = low && Math.random() < 0.35;
    if (guard) { this.eGuard = true; this.setLog(`${this.e.n} korunmaya gecti.`); }
    else {
      let d = dmg(this.e.atk, this.defVal(), 0.9, 1.18);
      if (this.pGuard) d = Math.max(1, Math.floor(d * 0.55));
      this.s.p.hp = Math.max(0, this.s.p.hp - d); this.setLog(`${this.e.n} ${d} hasar vurdu.`);
    }
    this.pGuard = false; this.refresh();
    if (this.s.p.hp <= 0) return this.finish({ result: "lose" });
    this.turn = "player"; this.busy = false;
  }

  finish(pl) {
    if (this.done) return;
    this.done = true; this.setEnabled(false);
    pl.source = this.source;
    pl.enemyId = this.e.id;
    if (pl.result === "win") this.setLog(`Zafer! +${pl.exp} TECR, +${pl.gold} Altin.`);
    else if (pl.result === "lose") this.setLog("Yenildin.");
    else this.setLog("Kactin.");
    this.time.delayedCall(850, () => { this.w.resolveBattle(pl); this.scene.stop(); this.scene.resume("world"); });
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#0b0f14",
  render: { pixelArt: true, antialias: false, roundPixels: true },
  physics: { default: "arcade", arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [WorldScene, BattleScene]
};

new Phaser.Game(config);

