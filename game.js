class MainScene extends Phaser.Scene {
  constructor() {
    super("main");

    this.speed = 140;

    // Tile ayarları
    this.TILE = 16;
    this.MAP_W = 120;
    this.MAP_H = 80;

    // Tile codes:
    // 0 = çim (walk)
    // 1 = yol (walk)
    // 2 = su (solid)
    // 3 = ağaç (solid, kırılabilir)
    // 4 = bina duvar (solid)
    // 5 = bina zemin (walk)
    // 6 = çit (solid)
    // 7 = taş (solid, kırılabilir)

    // Harvest ayarları
    this.HARVEST_HOLD_MS = 1000;
  }

  create() {
    this.cameras.main.setRoundPixels(true);

    // Envanter
    this.inventory = { odun: 0, tas: 0, altin: 0 };

    // Quest (7)
    this.quest = {
      id: "odun_5",
      title: "Görev: 5 Odun topla",
      resource: "odun",
      target: 5,
      progress: 0,
      rewardAltin: 10,
      completed: false,
    };

    // UI ikon/texture
    this.makeBagIcon();
    this.makePlayerTextures();

    // Map
    this.map = this.generateOverworld(this.MAP_W, this.MAP_H);

    // Çiz
    this.drawOverworld(this.map);

    // Dünya sınırları
    const worldW = this.MAP_W * this.TILE;
    const worldH = this.MAP_H * this.TILE;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // Collider grupları
    this.walls = this.physics.add.staticGroup();      // su/bina/çit
    this.resources = this.physics.add.staticGroup();  // ağaç/taş

    this.buildSolidColliders(this.map);    // 2,4,6
    this.buildResourceColliders(this.map); // 3,7

    // Spawn
    const spawn = this.spawn || { x: 10, y: 10 };
    this.player = this.physics.add.sprite(
      spawn.x * this.TILE + this.TILE / 2,
      spawn.y * this.TILE + this.TILE / 2,
      "p_down_0"
    );
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(10, 12, true);

    // Çarpışmalar
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.resources);

    // Kamera
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.setZoom(this.getZoomForScreen());
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");

    // Hold-to-harvest: E basılı tut
    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.interactKey.on("down", () => this.beginHarvestHold("keyboard"));
    this.interactKey.on("up", () => this.cancelHarvestHold());

    // Envanter: I
    this.invKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.invKey.on("down", () => this.toggleInventory());

    // Mobil hareket: sol tarafta sürükle
    this.pointer = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
    this.setupTouchMove();

    // UI: TOPLA (basılı tut)
    this.harvestBtn = this.add.text(0, 0, "TOPLA", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.45)",
      padding: { left: 12, right: 12, top: 8, bottom: 8 }
    });
    this.harvestBtn.setScrollFactor(0);
    this.harvestBtn.setDepth(9999);
    this.harvestBtn.setInteractive({ useHandCursor: true });
    this.harvestBtn.on("pointerdown", () => this.beginHarvestHold("touch"));
    this.harvestBtn.on("pointerup", () => this.cancelHarvestHold());
    this.harvestBtn.on("pointerout", () => this.cancelHarvestHold());


    // UI: Envanter (ikon + alt yazı)
    this.invBtn = this.add.container(0, 0).setScrollFactor(0).setDepth(9999);

    this.invBtnBg = this.add.rectangle(0, 0, 44, 44, 0x000000, 0.45).setOrigin(0, 0);
    this.invBtnBorder = this.add.rectangle(0, 0, 44, 44, 0xffffff, 0.10).setOrigin(0, 0);
    this.bagSprite = this.add.image(22, 22, "bag_icon").setOrigin(0.5, 0.5).setScale(1.1);

    // Alt yazı (Envanter (I))
    this.invBtnLabel = this.add.text(22, 52, "Envanter (I)", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "12px",
      color: "rgba(255,255,255,0.92)",
      backgroundColor: "rgba(0,0,0,0.25)",
      padding: { left: 6, right: 6, top: 3, bottom: 3 }
    }).setOrigin(0.5, 0);

    this.invBtn.add([this.invBtnBg, this.invBtnBorder, this.bagSprite, this.invBtnLabel]);

    // Hem ikon hem yazı tıklanabilir olsun
    this.invBtn.setSize(44, 70);
    this.invBtn.setInteractive(new Phaser.Geom.Rectangle(0, 0, 44, 70), Phaser.Geom.Rectangle.Contains);
    this.invBtn.on("pointerdown", () => this.toggleInventory());

    

    // Progress bar (hold) — TOPLA üstünde
    this.holdBg = this.add.rectangle(0, 0, 120, 10, 0x000000, 0.5).setOrigin(0, 0);
    this.holdFill = this.add.rectangle(0, 0, 0, 10, 0xffffff, 0.85).setOrigin(0, 0);
    this.holdBg.setScrollFactor(0).setDepth(9999).setVisible(false);
    this.holdFill.setScrollFactor(0).setDepth(10000).setVisible(false);

    // Toplama göstergesi (oyuncu üstünde) — dönen halka + küçük yazı
    this.harvestIndicator = this.add.container(0, 0);
    this.harvestIndicator.setDepth(9998);
    this.harvestIndicator.setVisible(false);

    this.harvestRing = this.add.graphics();
    this.harvestLabel = this.add.text(0, 12, "Toplanıyor...", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "10px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.30)",
      padding: { left: 4, right: 4, top: 2, bottom: 2 }
    }).setOrigin(0.5, 0.5);

    this.harvestIndicator.add([this.harvestRing, this.harvestLabel]);
    this.harvestRingAngle = 0;

    // (3) Yakınlık ipucu: “E - Topla”
    this.interactHint = this.add.text(0, 0, "E - Topla", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "12px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.35)",
      padding: { left: 6, right: 6, top: 3, bottom: 3 }
    }).setOrigin(0.5, 0.5);
    this.interactHint.setDepth(9998);
    this.interactHint.setVisible(false);

    // (7) Görev UI
    this.questText = this.add.text(0, 0, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "14px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.35)",
      padding: { left: 10, right: 10, top: 8, bottom: 8 },
      align: "left",
      wordWrap: { width: 240, useAdvancedWrap: true }
    });
    this.questText.setScrollFactor(0);
    this.questText.setDepth(20000); // UI üstünde kalsın
    this.questText.setStroke("rgba(0,0,0,0.8)", 4);


    this.positionUI();

        // --- UI Camera: UI zoom’dan etkilenmesin ---
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);

    // UI’ları ana kameradan gizle
    this.cameras.main.ignore([
      this.invBtn,
      this.harvestBtn,
      this.holdBg,
      this.holdFill,
      this.questText
    ]);

    // Dünya objelerini UI kameradan gizle
    // (worldG ve player kesin; ayrıca collider rectangle’lar da görünmez ama güvenli olsun)
    this.uiCam.ignore([
      this.worldG,
      this.player,
      ...this.walls.getChildren(),
      ...this.resources.getChildren()
    ]);


    window.addEventListener("resize", () => {
      this.cameras.main.setZoom(this.getZoomForScreen());
      this.positionUI();
      if (this.uiCam) {
        this.uiCam.setSize(this.scale.width, this.scale.height);
      }

    });

    // HTML Envanter overlay
    this.createInventoryOverlay();

    // HUD (debug gibi)
    this.hud = document.createElement("div");
    this.hud.style.position = "fixed";
    this.hud.style.left = "12px";
    this.hud.style.top = "12px";
    this.hud.style.color = "rgba(255,255,255,0.0)"; // görünmesin (istersen 0.85 yap)
    this.hud.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    this.hud.style.fontSize = "14px";
    this.hud.style.userSelect = "none";
    this.hud.innerText = "E basılı tut / TOPLA basılı tut → topla | Envanter: I";
    document.body.appendChild(this.hud);

    this.player.anims.play("idle_down", true);

    // Hold state
    this.harvestHold = null;
    this.harvestHoldEvent = null;

    // Görev metnini bas
    this.refreshQuestUI();

    // “topla başladı / bitti” için mini sesler (1)
    this.audioCtx = null;
  }

  positionUI() {
    const pad = 12;

    // Envanter sağ üst (küçük kare ikon)
    this.invBtn.x = this.scale.width - this.invBtn.width - pad;
    this.invBtn.y = pad;

    // TOPLA sağ alt
    this.harvestBtn.x = this.scale.width - this.harvestBtn.width - pad;
    this.harvestBtn.y = this.scale.height - this.harvestBtn.height - pad;

    // Progress bar, TOPLA'nın üstünde
    this.holdBg.x = this.harvestBtn.x;
    this.holdBg.y = this.harvestBtn.y - 16;
    this.holdFill.x = this.holdBg.x;
    this.holdFill.y = this.holdBg.y;


    // Görev: envanterin altında, sağ üstte, ekrandan taşmayacak şekilde
    const questW = 260;
    this.questText.x = Math.max(pad, this.scale.width - questW - pad);
    this.questText.y = this.invBtn.y + this.invBtn.height + 10;

  }

  getZoomForScreen() {
    const w = this.scale.width;
    if (w < 420) return 2;
    if (w < 900) return 3;
    return 4;
  }

  /* ---------------- MOVE TOUCH ---------------- */
  setupTouchMove() {
    this.input.on("pointerdown", (p) => {
      // sağ tarafta UI var diye sol taraf joystick gibi
      if (p.x > this.scale.width * 0.6) return;
      this.pointer.active = true;
      this.pointer.startX = p.x;
      this.pointer.startY = p.y;
      this.pointer.dx = 0;
      this.pointer.dy = 0;
    });
    this.input.on("pointermove", (p) => {
      if (!this.pointer.active) return;
      this.pointer.dx = p.x - this.pointer.startX;
      this.pointer.dy = p.y - this.pointer.startY;
    });
    this.input.on("pointerup", () => {
      this.pointer.active = false;
      this.pointer.dx = 0;
      this.pointer.dy = 0;
    });
  }

  /* ---------------- (1) SFX: minimal beep ---------------- */
  ensureAudio() {
    if (this.audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.audioCtx = new Ctx();
  }

  playBeep(freq, ms, gain = 0.03) {
    this.ensureAudio();
    if (!this.audioCtx) return;

    // iOS/Chrome policy: user gesture sonrası çalışır; biz pointerdown/keydown içinde çağırıyoruz.
    try {
      const ctx = this.audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "square";
      o.frequency.value = freq;
      g.gain.value = gain;

      o.connect(g);
      g.connect(ctx.destination);

      const now = ctx.currentTime;
      o.start(now);
      o.stop(now + ms / 1000);

      // kısa fade
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
    } catch (_) {}
  }

  /* ---------------- HOLD TO HARVEST ---------------- */
  beginHarvestHold(source) {
    // Zaten hold varsa yeniden başlatma
    if (this.harvestHold) return;

    // Hedef tile’ı hold başında “kilitle”
    const target = this.getHarvestTarget();
    if (!target) return;

    // (1) başlama beep
    this.playBeep(520, 60, 0.025);

    this.harvestHold = {
      source,
      startTime: this.time.now,
      targetX: target.x,
      targetY: target.y,
      tileType: target.tileType
    };

    // Progress bar aç
    this.holdBg.setVisible(true);
    this.holdFill.setVisible(true);
    this.holdFill.width = 0;

    // Görsel gösterge aç
    this.harvestIndicator.setVisible(true);
    this.harvestRingAngle = 0;

    // 1 sn sonra bitir
    this.harvestHoldEvent = this.time.addEvent({
      delay: this.HARVEST_HOLD_MS,
      callback: () => this.finishHarvestHold()
    });
  }

  cancelHarvestHold() {
    if (!this.harvestHold) return;

    this.harvestHold = null;

    if (this.harvestHoldEvent) {
      this.harvestHoldEvent.remove(false);
      this.harvestHoldEvent = null;
    }

    // Progress bar kapat
    this.holdBg.setVisible(false);
    this.holdFill.setVisible(false);
    this.holdFill.width = 0;

    // Görsel gösterge kapat
    this.harvestIndicator.setVisible(false);
    this.harvestRing.clear();
  }

  finishHarvestHold() {
    if (!this.harvestHold) return;

    const { targetX, targetY, tileType } = this.harvestHold;

    // Hedef hala aynı mı?
    if (this.map[targetY]?.[targetX] !== tileType) {
      this.cancelHarvestHold();
      return;
    }

    // Swing + harvest
    this.playSwing(tileType);
    this.doHarvestAt(targetX, targetY, tileType);

    this.cancelHarvestHold();
  }

  getHarvestTarget() {
    const ts = this.TILE;
    const px = Math.floor(this.player.x / ts);
    const py = Math.floor(this.player.y / ts);

    const dir = this.player.lastDir || "down";
    const d = { x: 0, y: 0 };
    if (dir === "up") d.y = -1;
    else if (dir === "down") d.y = 1;
    else if (dir === "left") d.x = -1;
    else if (dir === "right") d.x = 1;

    const tx = px + d.x;
    const ty = py + d.y;

    if (ty < 0 || ty >= this.map.length || tx < 0 || tx >= this.map[0].length) return null;

    const tile = this.map[ty][tx];
    if (tile !== 3 && tile !== 7) return null;

    return { x: tx, y: ty, tileType: tile };
  }

  // (1) popup
  spawnLootPopup(text) {
    const t = this.add.text(this.player.x, this.player.y - 22, text, {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "12px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.35)",
      padding: { left: 6, right: 6, top: 3, bottom: 3 }
    }).setOrigin(0.5, 0.5);
    t.setDepth(9998);

    this.tweens.add({
      targets: t,
      y: t.y - 18,
      alpha: 0,
      duration: 800,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy()
    });
  }

  doHarvestAt(tx, ty, tileType) {
    let lootText = "";

    if (tileType === 3) {
      this.inventory.odun += 1;
      lootText = "+1 Odun";
      // (7) quest ilerlet
      this.advanceQuest("odun", 1);
    } else if (tileType === 7) {
      this.inventory.tas += 1;
      lootText = "+1 Taş";
      // ileride taş görevi koyarsın
    }

    this.updateInventoryOverlay();

    // (1) başarı beep + popup
    this.playBeep(760, 70, 0.03);
    if (lootText) this.spawnLootPopup(lootText);

    // Haritadan kaldır
    this.map[ty][tx] = 0;

    // Collider sil
    const body = this.findResourceBody(tx, ty);
    if (body) body.destroy();

    // Görsel yenile
    this.redrawWorld();

    // Respawn
    const base = (tileType === 3) ? 40000 : 30000;
    const jitter = this.randInt(-8000, 8000);
    const delay = Math.max(8000, base + jitter);
    this.scheduleRespawn(tx, ty, tileType, delay);
  }

  playSwing() {
    const dir = this.player.lastDir || "down";
    const sign = (dir === "left" || dir === "up") ? -1 : 1;

    const slash = this.add.rectangle(this.player.x, this.player.y, 14, 3, 0xffffff, 0.9);
    slash.setAngle(20 * sign);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 180,
      onComplete: () => slash.destroy()
    });

    this.tweens.add({
      targets: this.player,
      angle: 15 * sign,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => { this.player.angle = 0; }
    });
  }

  /* ---------------- (7) QUEST ---------------- */
  advanceQuest(resource, amount) {
    console.log("QUEST ADVANCE:", resource, amount, "=>", this.quest?.progress, "/", this.quest?.target);

    if (!this.quest || this.quest.completed) return;
    if (this.quest.resource !== resource) return;

    this.quest.progress = Math.min(this.quest.target, this.quest.progress + amount);
    this.refreshQuestUI();

    if (this.quest.progress >= this.quest.target) {
      this.quest.completed = true;
      this.inventory.altin += this.quest.rewardAltin;
      this.updateInventoryOverlay();

      this.spawnLootPopup(`Görev tamam! +${this.quest.rewardAltin} Altın`);
      this.playBeep(980, 90, 0.035);

      this.refreshQuestUI();
    }
  }

  refreshQuestUI() {
    if (!this.questText) return;

    if (!this.quest) {
      this.questText.setText("");
      return;
    }

    if (this.quest.completed) {
      this.questText.setText(
        `${this.quest.title}\nTamamlandı ✓  (+${this.quest.rewardAltin} Altın)`
      );
    } else {
      this.questText.setText(
        `${this.quest.title}\n(${this.quest.progress}/${this.quest.target})  Ödül: ${this.quest.rewardAltin} Altın`
      );
    }
  }

  /* ---------------- INVENTORY UI (HTML overlay) ---------------- */
  createInventoryOverlay() {
    this.invOpen = false;

    this.invOverlay = document.createElement("div");
    this.invOverlay.style.position = "fixed";
    this.invOverlay.style.left = "0";
    this.invOverlay.style.top = "0";
    this.invOverlay.style.width = "100%";
    this.invOverlay.style.height = "100%";
    this.invOverlay.style.display = "none";
    this.invOverlay.style.alignItems = "center";
    this.invOverlay.style.justifyContent = "center";
    this.invOverlay.style.background = "rgba(0,0,0,0.55)";
    this.invOverlay.style.zIndex = "99999";

    this.invPanel = document.createElement("div");
    this.invPanel.style.width = "min(420px, 90vw)";
    this.invPanel.style.background = "rgba(10,14,20,0.95)";
    this.invPanel.style.border = "1px solid rgba(255,255,255,0.12)";
    this.invPanel.style.borderRadius = "14px";
    this.invPanel.style.padding = "16px 16px";
    this.invPanel.style.color = "rgba(255,255,255,0.9)";
    this.invPanel.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";

    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.justifyContent = "space-between";
    title.style.alignItems = "center";
    title.style.marginBottom = "10px";

    const h = document.createElement("div");
    h.style.fontSize = "18px";
    h.style.fontWeight = "600";
    h.innerText = "Envanter (I)";
    title.appendChild(h);

    const close = document.createElement("button");
    close.innerText = "Kapat";
    close.style.background = "rgba(255,255,255,0.12)";
    close.style.border = "1px solid rgba(255,255,255,0.18)";
    close.style.color = "rgba(255,255,255,0.9)";
    close.style.padding = "6px 10px";
    close.style.borderRadius = "10px";
    close.style.cursor = "pointer";
    close.onclick = () => this.toggleInventory(false);
    title.appendChild(close);

    this.invList = document.createElement("div");
    this.invList.style.display = "grid";
    this.invList.style.gridTemplateColumns = "1fr";
    this.invList.style.gap = "10px";

    this.invPanel.appendChild(title);
    this.invPanel.appendChild(this.invList);
    this.invOverlay.appendChild(this.invPanel);
    document.body.appendChild(this.invOverlay);

    this.invOverlay.addEventListener("mousedown", (e) => {
      if (e.target === this.invOverlay) this.toggleInventory(false);
    });

    this.updateInventoryOverlay();
  }

  toggleInventory(forceState) {
    const next = (typeof forceState === "boolean") ? forceState : !this.invOpen;
    this.invOpen = next;
    this.invOverlay.style.display = this.invOpen ? "flex" : "none";
    if (this.invOpen) this.updateInventoryOverlay();
  }

  updateInventoryOverlay() {
    if (!this.invList) return;
    this.invList.innerHTML = "";

    const row = (label, value) => {
      const r = document.createElement("div");
      r.style.display = "flex";
      r.style.justifyContent = "space-between";
      r.style.padding = "10px 12px";
      r.style.border = "1px solid rgba(255,255,255,0.10)";
      r.style.borderRadius = "12px";
      r.style.background = "rgba(255,255,255,0.04)";

      const a = document.createElement("div");
      a.innerText = label;

      const b = document.createElement("div");
      b.style.fontWeight = "600";
      b.innerText = String(value);

      r.appendChild(a);
      r.appendChild(b);
      return r;
    };

    this.invList.appendChild(row("Altın", this.inventory.altin));
    this.invList.appendChild(row("Odun", this.inventory.odun));
    this.invList.appendChild(row("Taş", this.inventory.tas));
  }

  /* ---------------- ICON TEXTURE ---------------- */
  makeBagIcon() {
    if (this.textures.exists("bag_icon")) return;

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.clear();

    g.fillStyle(0x8b6b3f, 1);
    g.fillRect(3, 5, 10, 9);

    g.fillStyle(0xa68455, 1);
    g.fillRect(3, 5, 10, 3);

    g.lineStyle(2, 0xd2b48c, 1);
    g.beginPath();
    g.arc(8, 5, 4, Math.PI, 0, false);
    g.strokePath();

    g.fillStyle(0x2b2b2b, 0.9);
    g.fillRect(7, 9, 2, 2);

    g.generateTexture("bag_icon", 16, 16);
    g.destroy();
  }

  /* ---------------- OVERWORLD GENERATOR ---------------- */
  generateOverworld(w, h) {
    const m = Array.from({ length: h }, () => Array(w).fill(0)); // çim

    // Su (gölet)
    for (let i = 0; i < 3; i++) {
      const sx = this.randInt(Math.floor(w * 0.15), Math.floor(w * 0.85));
      const sy = this.randInt(Math.floor(h * 0.15), Math.floor(h * 0.85));
      this.splatBlob(m, sx, sy, this.randInt(90, 140), 2);
    }
    this.smooth(m, 2, 2);

    // Kasaba + yollar
    const townX = Math.floor(w * 0.35);
    const townY = Math.floor(h * 0.55);
    this.carveRect(m, townX - 6, townY - 4, 12, 8, 1);

    this.carvePath(m, townX, townY, w - 8, townY, 1, 2);
    this.carvePath(m, townX, townY, townX, 8, 1, 2);
    this.carvePath(m, townX, townY, townX, h - 10, 1, 2);

    // Evler
    const houses = [
      { x: townX - 18, y: townY - 10, w: 10, h: 8 },
      { x: townX + 10, y: townY - 10, w: 10, h: 8 },
      { x: townX - 18, y: townY + 4,  w: 12, h: 9 },
      { x: townX + 10, y: townY + 4,  w: 12, h: 9 },
    ];
    for (const r of houses) {
      this.placeHouse(m, r.x, r.y, r.w, r.h, { doorSide: "bottom" });
      const door = this.lastDoor;
      if (door) this.carvePath(m, door.x, door.y + 1, townX, townY, 1, 2);
    }

    // Çitli tarla
    const farmX = townX + 22;
    const farmY = townY + 10;
    const fw = 18, fh = 12;
    this.placeFence(m, farmX, farmY, fw, fh);
    m[farmY + fh - 1][farmX + Math.floor(fw / 2)] = 1;
    this.carvePath(m, farmX + Math.floor(fw / 2), farmY + fh, townX, townY, 1, 2);

    // Ağaç kümeleri
    for (let i = 0; i < 6; i++) {
      const sx = this.randInt(6, w - 7);
      const sy = this.randInt(6, h - 7);
      this.splatBlob(m, sx, sy, this.randInt(100, 170), 3);
    }

    // Taş kümeleri
    for (let i = 0; i < 5; i++) {
      const sx = this.randInt(8, w - 9);
      const sy = this.randInt(8, h - 9);
      this.splatBlob(m, sx, sy, this.randInt(40, 75), 7);
    }

    // Su kıyısında ağaç/taş temizle
    this.clearNear(m, 2, 3, 1);
    this.clearNear(m, 2, 7, 1);

    // Spawn
    this.spawn = { x: townX - 2, y: townY };

    return m;
  }

  carveRect(m, x, y, w, h, tile) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (yy <= 1 || yy >= m.length - 2 || xx <= 1 || xx >= m[0].length - 2) continue;
        if (m[yy][xx] === 2) continue;
        m[yy][xx] = tile;
      }
    }
  }

  carvePath(m, x1, y1, x2, y2, tile, thickness = 2) {
    const W = m[0].length, H = m.length;

    const dig = (x, y) => {
      for (let dy = -Math.floor(thickness / 2); dy <= Math.floor(thickness / 2); dy++) {
        for (let dx = -Math.floor(thickness / 2); dx <= Math.floor(thickness / 2); dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx <= 1 || xx >= W - 2 || yy <= 1 || yy >= H - 2) continue;
          if (m[yy][xx] === 2) continue;
          if (m[yy][xx] === 4) continue;
          m[yy][xx] = tile;
        }
      }
    };

    let x = x1, y = y1;
    const sx = x2 > x1 ? 1 : -1;
    const sy = y2 > y1 ? 1 : -1;

    while (x !== x2) { dig(x, y); x += sx; }
    while (y !== y2) { dig(x, y); y += sy; }
    dig(x2, y2);
  }

  placeHouse(m, x, y, rw, rh, { doorSide = "bottom" } = {}) {
    const W = m[0].length, H = m.length;
    const inB = (xx, yy) => xx >= 2 && yy >= 2 && xx <= W - 3 && yy <= H - 3;

    for (let yy = y; yy < y + rh; yy++) {
      for (let xx = x; xx < x + rw; xx++) {
        if (!inB(xx, yy)) continue;
        m[yy][xx] = 4;
      }
    }
    for (let yy = y + 1; yy < y + rh - 1; yy++) {
      for (let xx = x + 1; xx < x + rw - 1; xx++) {
        if (!inB(xx, yy)) continue;
        m[yy][xx] = 5;
      }
    }

    const dx = x + Math.floor(rw / 2);
    const dy = (doorSide === "bottom") ? (y + rh - 1) : y;
    if (inB(dx, dy)) {
      m[dy][dx] = 1;
      this.lastDoor = { x: dx, y: dy };
    } else {
      this.lastDoor = null;
    }
  }

  placeFence(m, x, y, rw, rh) {
    const W = m[0].length, H = m.length;
    const inB = (xx, yy) => xx >= 2 && yy >= 2 && xx <= W - 3 && yy <= H - 3;

    for (let xx = x; xx < x + rw; xx++) {
      if (inB(xx, y)) m[y][xx] = 6;
      if (inB(xx, y + rh - 1)) m[y + rh - 1][xx] = 6;
    }
    for (let yy = y; yy < y + rh; yy++) {
      if (inB(x, yy)) m[yy][x] = 6;
      if (inB(x + rw - 1, yy)) m[yy][x + rw - 1] = 6;
    }
  }

  splatBlob(m, sx, sy, steps, tile) {
    const W = m[0].length, H = m.length;
    let x = sx, y = sy;

    for (let i = 0; i < steps; i++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx <= 1 || xx >= W - 2 || yy <= 1 || yy >= H - 2) continue;

          if (tile === 2 && (m[yy][xx] === 4 || m[yy][xx] === 5)) continue;
          if (tile === 3 && (m[yy][xx] === 1 || m[yy][xx] === 4 || m[yy][xx] === 5 || m[yy][xx] === 6)) continue;
          if (tile === 7 && (m[yy][xx] === 1 || m[yy][xx] === 4 || m[yy][xx] === 5 || m[yy][xx] === 6)) continue;

          m[yy][xx] = tile;
        }
      }

      x += this.randInt(-1, 1);
      y += this.randInt(-1, 1);
      x = Math.max(2, Math.min(W - 3, x));
      y = Math.max(2, Math.min(H - 3, y));
    }
  }

  smooth(m, target, iterations = 2) {
    const W = m[0].length, H = m.length;
    for (let it = 0; it < iterations; it++) {
      const copy = m.map(row => row.slice());
      for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
          let c = 0;
          for (let yy = y - 1; yy <= y + 1; yy++) {
            for (let xx = x - 1; xx <= x + 1; xx++) {
              if (copy[yy][xx] === target) c++;
            }
          }
          if (copy[y][x] === target) {
            if (c <= 2) m[y][x] = 0;
          } else {
            if (c >= 6) m[y][x] = target;
          }
        }
      }
    }
  }

  clearNear(m, targetTile, removeTile, radius = 1) {
    const W = m[0].length, H = m.length;
    const copy = m.map(r => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (copy[y][x] !== targetTile) continue;
      for (let yy = y - radius; yy <= y + radius; yy++) {
        for (let xx = x - radius; xx <= x + radius; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (m[yy][xx] === removeTile) m[yy][xx] = 0;
        }
      }
    }
  }

  /* ---------------- DRAW ---------------- */
  drawOverworld(m) {
    this.worldG = this.add.graphics();
    this.drawOverworldTo(this.worldG, m);
  }

  drawOverworldTo(g, m) {
    const ts = this.TILE;

    // Çim
    g.fillStyle(0x0e2a1a, 1);
    g.fillRect(0, 0, this.MAP_W * ts, this.MAP_H * ts);

    // çim dokusu
    g.fillStyle(0x12351f, 1);
    for (let i = 0; i < 3500; i++) {
      const x = this.randInt(0, this.MAP_W * ts - 1);
      const y = this.randInt(0, this.MAP_H * ts - 1);
      g.fillRect(x, y, 1, 1);
    }

    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[0].length; x++) {
        const t = m[y][x];
        const px = x * ts, py = y * ts;

        if (t === 1) { // yol
          g.fillStyle(0x8b6b3f, 1);
          g.fillRect(px, py, ts, ts);
          g.fillStyle(0xa68455, 1);
          g.fillRect(px, py, ts, 2);
        }
        else if (t === 2) { // su
          g.fillStyle(0x1c4f8a, 1);
          g.fillRect(px, py, ts, ts);
          g.fillStyle(0x2f6db5, 1);
          g.fillRect(px, py, ts, 2);
        }
        else if (t === 3) { // ağaç
          g.fillStyle(0x0b1a10, 0.65);
          g.fillRect(px + 2, py + 10, ts - 4, 4);
          g.fillStyle(0x6b4a2b, 1);
          g.fillRect(px + 7, py + 8, 2, 6);
          g.fillStyle(0x2f7d3a, 1);
          g.fillRect(px + 3, py + 2, ts - 6, 8);
          g.fillStyle(0x3c9b48, 1);
          g.fillRect(px + 4, py + 3, ts - 8, 2);
        }
        else if (t === 4) { // bina duvar
          g.fillStyle(0x6c4a3a, 1);
          g.fillRect(px, py, ts, ts);
          g.fillStyle(0x8a5d48, 1);
          g.fillRect(px, py, ts, 2);
        }
        else if (t === 5) { // bina zemin
          g.fillStyle(0x5a3b2a, 1);
          g.fillRect(px, py, ts, ts);
          g.fillStyle(0x6d4a35, 1);
          g.fillRect(px, py, ts, 2);
        }
        else if (t === 6) { // çit
          g.fillStyle(0x9a7b4f, 1);
          g.fillRect(px, py, ts, ts);
          g.fillStyle(0x6d5638, 1);
          g.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        }
        else if (t === 7) { // taş
          g.fillStyle(0x6b7280, 1);
          g.fillRect(px, py, ts, ts);
          g.fillStyle(0x8b93a1, 1);
          g.fillRect(px + 2, py + 3, ts - 4, 3);
          g.fillStyle(0x4b5563, 1);
          g.fillRect(px + 3, py + 9, ts - 6, 4);
        }
      }
    }

    g.setDepth(-10);
  }

  redrawWorld() {
    if (this.worldG) this.worldG.destroy();
    this.worldG = this.add.graphics();
    this.drawOverworldTo(this.worldG, this.map);
    if (this.uiCam) {
      this.uiCam.ignore(this.worldG);
    }

  }

  /* ---------------- COLLIDERS ---------------- */
  buildSolidColliders(m) {
    const solid = new Set([2, 4, 6]); // kalıcı
    const ts = this.TILE;
    const H = m.length, W = m[0].length;

    for (let y = 0; y < H; y++) {
      let runStart = -1;
      let runType = null;

      for (let x = 0; x <= W; x++) {
        const isSolid = (x < W) && solid.has(m[y][x]);
        const t = (x < W) ? m[y][x] : null;

        if (isSolid && runStart === -1) { runStart = x; runType = t; }

        const runBreak = (!isSolid || t !== runType || x === W);
        if (runStart !== -1 && runBreak) {
          const runEnd = x - 1;
          const runLen = runEnd - runStart + 1;

          const cx = (runStart * ts) + (runLen * ts) / 2;
          const cy = (y * ts) + ts / 2;

          const obj = this.add.rectangle(cx, cy, runLen * ts, ts, 0x000000, 0);
          this.physics.add.existing(obj, true);
          this.walls.add(obj);

          runStart = -1;
          runType = null;
        }
      }
    }
  }

  buildResourceColliders(m) {
    const ts = this.TILE;
    const H = m.length, W = m[0].length;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = m[y][x];
        if (t !== 3 && t !== 7) continue;

        const cx = x * ts + ts / 2;
        const cy = y * ts + ts / 2;

        const obj = this.add.rectangle(cx, cy, ts, ts, 0x000000, 0);
        obj._tileX = x;
        obj._tileY = y;
        obj._tileType = t;

        this.physics.add.existing(obj, true);
        this.resources.add(obj);
      }
    }
  }

  findResourceBody(tx, ty) {
    const children = this.resources.getChildren();
    for (const obj of children) {
      if (obj._tileX === tx && obj._tileY === ty) return obj;
    }
    return null;
  }

  scheduleRespawn(x, y, tileType, delayMs) {
    if (!this._respawn) this._respawn = new Map();
    const key = `${x},${y}`;
    if (this._respawn.has(key)) return;

    const evt = this.time.addEvent({
      delay: delayMs,
      callback: () => {
        this._respawn.delete(key);

        if (this.map[y][x] === 0) {
          this.map[y][x] = tileType;

          const ts = this.TILE;
          const cx = x * ts + ts / 2;
          const cy = y * ts + ts / 2;

          const obj = this.add.rectangle(cx, cy, ts, ts, 0x000000, 0);
          obj._tileX = x;
          obj._tileY = y;
          obj._tileType = tileType;

          this.physics.add.existing(obj, true);
          this.resources.add(obj);

          this.redrawWorld();
        }
      }
    });

    this._respawn.set(key, evt);
  }

  /* ---------------- PLAYER TEXTURES ---------------- */
  makePlayerTextures() {
    const w = 12, h = 16;

    const drawFrame = (key, dir, step) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.clear();

      g.fillStyle(0x8fd3ff, 1);
      g.fillRect(3, 5, 6, 7);

      g.fillStyle(0xffe0bd, 1);
      g.fillRect(4, 2, 4, 3);

      g.fillStyle(0x2b2b2b, 1);
      g.fillRect(4, 1, 4, 1);

      g.fillStyle(0x000000, 0.9);
      if (dir === "down") { g.fillRect(5, 3, 1, 1); g.fillRect(7, 3, 1, 1); }
      else if (dir === "up") { g.fillStyle(0x1d1d1d, 0.6); g.fillRect(4, 2, 4, 1); }
      else if (dir === "left") { g.fillStyle(0x000000, 0.9); g.fillRect(5, 3, 1, 1); }
      else if (dir === "right") { g.fillStyle(0x000000, 0.9); g.fillRect(7, 3, 1, 1); }

      g.fillStyle(0x243447, 1);
      const s = step === 0 ? 0 : 1;
      g.fillRect(4, 12, 2, 3 + s);
      g.fillRect(6, 12, 2, 3 + (1 - s));

      g.fillStyle(0x6fbbe8, 1);
      if (dir === "left") g.fillRect(2, 6, 1, 5);
      else if (dir === "right") g.fillRect(9, 6, 1, 5);
      else { g.fillRect(2, 7, 1, 4); g.fillRect(9, 7, 1, 4); }

      g.generateTexture(key, w, h);
      g.destroy();
    };

    const dirs = ["down", "up", "left", "right"];
    for (const dir of dirs) {
      drawFrame(`p_${dir}_0`, dir, 0);
      drawFrame(`p_${dir}_1`, dir, 1);
    }

    const mkAnim = (key, a, b) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: [{ key: a }, { key: b }], frameRate: 8, repeat: -1 });
    };
    mkAnim("walk_down", "p_down_0", "p_down_1");
    mkAnim("walk_up", "p_up_0", "p_up_1");
    mkAnim("walk_left", "p_left_0", "p_left_1");
    mkAnim("walk_right", "p_right_0", "p_right_1");

    const mkIdle = (key, frameKey) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: [{ key: frameKey }], frameRate: 1, repeat: -1 });
    };
    mkIdle("idle_down", "p_down_0");
    mkIdle("idle_up", "p_up_0");
    mkIdle("idle_left", "p_left_0");
    mkIdle("idle_right", "p_right_0");
  }

  /* ---------------- UPDATE ---------------- */
  update() {
    // (3) Yakınlık ipucu kontrolü
    const nearby = this.getHarvestTarget();
    if (nearby && !this.harvestHold) {
      const ts = this.TILE;
      const cx = (nearby.x * ts) + ts / 2;
      const cy = (nearby.y * ts) + ts / 2;
      this.interactHint.setPosition(cx, cy - 18);
      this.interactHint.setVisible(true);
    } else {
      this.interactHint.setVisible(false);
    }

    // Hold progress + spinner
    if (this.harvestHold) {
      const t = this.time.now - this.harvestHold.startTime;
      const p = Phaser.Math.Clamp(t / this.HARVEST_HOLD_MS, 0, 1);
      this.holdFill.width = Math.floor(120 * p);

      this.harvestIndicator.x = this.player.x;
      this.harvestIndicator.y = this.player.y - 18;

      this.harvestRingAngle += 0.25;
      const r = 10;
      const start = this.harvestRingAngle;
      const end = start + Math.PI * 1.35;

      this.harvestRing.clear();
      this.harvestRing.lineStyle(3, 0xffffff, 0.9);
      this.harvestRing.beginPath();
      this.harvestRing.arc(0, 0, r, start, end, false);
      this.harvestRing.strokePath();

      // Hedef değiştiyse iptal
      const cur = this.getHarvestTarget();
      if (!cur || cur.x !== this.harvestHold.targetX || cur.y !== this.harvestHold.targetY) {
        this.cancelHarvestHold();
      }
    }

    // Movement
    const left  = this.cursors.left.isDown  || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up    = this.cursors.up.isDown    || this.keys.W.isDown;
    const down  = this.cursors.down.isDown  || this.keys.S.isDown;

    let x = 0, y = 0;
    if (left) x -= 1;
    if (right) x += 1;
    if (up) y -= 1;
    if (down) y += 1;

    if (this.pointer.active) {
      const dead = 10;
      const dx = this.pointer.dx;
      const dy = this.pointer.dy;
      if (Math.abs(dx) > dead || Math.abs(dy) > dead) {
        if (Math.abs(dx) > Math.abs(dy)) x += dx > 0 ? 1 : -1;
        else y += dy > 0 ? 1 : -1;
      }
    }

    const mag = Math.hypot(x, y);
    if (mag > 0) { x /= mag; y /= mag; }

    this.player.setVelocity(x * this.speed, y * this.speed);

    const vx = this.player.body.velocity.x;
    const vy = this.player.body.velocity.y;
    if (!this.player.lastDir) this.player.lastDir = "down";

    if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
      if (Math.abs(vx) > Math.abs(vy)) this.player.lastDir = vx > 0 ? "right" : "left";
      else this.player.lastDir = vy > 0 ? "down" : "up";
      this.player.anims.play(`walk_${this.player.lastDir}`, true);
    } else {
      this.player.anims.play(`idle_${this.player.lastDir}`, true);
    }
  }

  /* ---------------- UTILS ---------------- */
  randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
}

/* ---------------- BOOT ---------------- */
const config = {
  type: Phaser.AUTO,
  backgroundColor: "#0b0f14",
  render: { pixelArt: true, antialias: false, roundPixels: true },
  physics: { default: "arcade", arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MainScene]
};

new Phaser.Game(config);
