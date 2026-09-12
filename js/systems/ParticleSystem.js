// 粒子與視覺特效系統 (浮動傷害數字、爆炸火花、落雷電弧、受傷碎片)

// 特效數量上限：避免滿級燃燒瓶×大批怪、全場炸彈等極端場面把行動裝置壓垮。
// 跳字用「丟最舊保留最新」；粒子用「容量不足就少生幾顆」。
const MAX_PARTICLES = 900;
const MAX_DAMAGE_TEXTS = 110;
const MAX_LIGHTNINGS = 12;

// 跳字字型是固定的三種，原本每幀重新建一個 fonts 陣列 + 三個字串常值；
// 拉出來當模組常數，順便讓三桶的容器也能重複使用。
const TEXT_FONTS = [
  "bold 14px 'Chakra Petch', sans-serif",
  "bold 20px 'Chakra Petch', sans-serif",
  "bold 27px 'Chakra Petch', sans-serif",
];
const TEXT_BUCKETS = [[], [], []];

export class ParticleSystem {
  constructor() {
    this.particles = [];
    // 跳字環狀緩衝：這仍是一個陣列，但滿了之後是「就地覆寫最舊槽位」，
    // 而不是 shift() 把後面 110 筆整排往前搬。_dtHead 指向最舊的一筆。
    this.damageTexts = [];
    this._dtHead = 0;
    this._dtCount = 0;
    this.lightnings = [];
    // 每幀的摩擦衰減倍率快取 (見 update)
    this._frictionMul = new Map();
  }

  update(dt) {
    // 摩擦衰減：原本每顆粒子每幀各算一次 Math.pow(friction, dt*60)（最多 900 次），
    // 但 friction 只有少數幾個寫死的值 —— 每幀每個值算一次就夠，其餘查表。
    const exp = dt * 60;
    const frictions = this._frictionMul;
    frictions.clear();

    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = p.friction || 0.92;
      let mul = frictions.get(f);
      if (mul === undefined) {
        mul = Math.pow(f, exp);
        frictions.set(f, mul);
      }
      p.vx *= mul;
      p.vy *= mul;
    }

    // 更新傷害數字。過期的留在槽位裡變成死槽（draw 會跳過），等新跳字來覆寫；
    // 因為壽命只有 0.65/0.7 兩種且都遞增，死槽必定是環上最舊的一段，淘汰順序不變。
    const texts = this.damageTexts;
    for (let i = 0; i < texts.length; i++) {
      const dtText = texts[i];
      if (dtText.life <= 0) continue;
      dtText.life -= dt;
      if (dtText.life <= 0) continue;
      dtText.y -= 25 * dt; // 向上漂浮 (字級固定，靠 alpha 淡出即可)
    }

    // 更新雷擊閃光
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      const l = this.lightnings[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.lightnings.splice(i, 1);
      }
    }
  }

  createDamageText(x, y, text, isCrit = false, isRealCrit = false) {
    // 跳字太多時丟掉最舊的 (已淡出大半)，保留最新傷害反饋
    const displayText = typeof text === 'number' ? String(Math.round(text)) : String(text);
    this._pushDamageText({
      x: x + (Math.random() * 16 - 8),
      y: y - 10 + (Math.random() * 10 - 5),
      text: displayText,
      isCrit: isCrit,
      life: 0.65,
      maxLife: 0.65,
      scale: isRealCrit ? 1.9 : isCrit ? 1.4 : 1.0,
      bucket: isRealCrit ? 2 : isCrit ? 1 : 0,
      color: isRealCrit ? '#ff3860' : isCrit ? '#ffb703' : '#ffffff',
      suffix: isRealCrit ? '!' : '',
    });
  }

  // 把新跳字放進環狀緩衝：未滿就 append，滿了就覆寫最舊槽位 (O(1))
  _pushDamageText(obj) {
    const texts = this.damageTexts;
    if (this._dtCount < MAX_DAMAGE_TEXTS) {
      texts.push(obj);
      this._dtCount++;
      return;
    }
    texts[this._dtHead] = obj;
    this._dtHead = (this._dtHead + 1) % MAX_DAMAGE_TEXTS;
  }

  // 玩家受傷的跳字：負號 + 紅字，跟自己打出的暴擊 (大紅字加驚嘆號) 區分開
  createHurtText(x, y, amount) {
    this._pushDamageText({
      x: x + (Math.random() * 10 - 5),
      y: y - 24,
      text: `-${Math.round(amount)}`,
      isCrit: false,
      life: 0.7,
      maxLife: 0.7,
      scale: 1.3,
      bucket: 1,
      color: '#ff5c7a',
      suffix: '',
    });
  }

  createDeathParticles(x, y, color = '#38b000', count = 8) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 140 + 40;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3.5 + 2,
        color: color,
        life: 0.45,
        maxLife: 0.45,
        friction: 0.88,
      });
    }
  }

  createExplosion(x, y, radius, isEvo = false) {
    // 衝擊波環 (容量滿就略過視覺，傷害計算不受影響)
    if (this.particles.length < MAX_PARTICLES) {
      this.particles.push({
        type: 'shockwave',
        x: x,
        y: y,
        radius: 5,
        maxRadius: radius,
        color: isEvo ? '#ff0055' : '#ff9900',
        life: 0.35,
        maxLife: 0.35,
      });
    }

    // 破片與火花
    const count = isEvo ? 24 : 14;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 220 + 60;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 4 + 2,
        color: isEvo ? (Math.random() > 0.5 ? '#ff0055' : '#ffff00') : '#ffaa00',
        life: 0.5,
        maxLife: 0.5,
        friction: 0.86,
      });
    }
  }

  // 純衝擊波環 (角色特質用)
  createShockwave(x, y, radius, color = '#00e5ff') {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({
      type: 'shockwave',
      x, y,
      radius: 6,
      maxRadius: radius,
      color,
      life: 0.4,
      maxLife: 0.4,
    });
  }

  // 腳下小火花 (兔兔火痕用)
  createHitSpark(x, y, color = '#ff6b00') {
    for (let i = 0; i < 4; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 40,
        vy: Math.sin(angle) * 40 - 20,
        radius: Math.random() * 3 + 2,
        color,
        life: 0.35,
        maxLife: 0.35,
        friction: 0.85,
      });
    }
  }

  // 兩點之間的鋸齒電弧 (蓄能電擊跳躍用)，沿用落雷的折線渲染
  createArc(x1, y1, x2, y2, color = '#7df8ff') {
    if (this.lightnings.length >= MAX_LIGHTNINGS) return;
    const segments = 6;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const jitter = i === 0 || i === segments ? 0 : (Math.random() - 0.5) * 26;
      points.push({
        x: x1 + (x2 - x1) * t + (nx / len) * jitter,
        y: y1 + (y2 - y1) * t + (ny / len) * jitter,
      });
    }
    this.lightnings.push({ points, radius: 10, color, life: 0.18, maxLife: 0.18 });
  }

  createLightning(x, y, radius, isEvo = false) {
    if (this.lightnings.length >= MAX_LIGHTNINGS) return;
    // 生成折線落雷節點
    const points = [];
    const startY = y - 400;
    const segments = 7;
    let currentX = x;
    let currentY = startY;

    points.push({ x: currentX, y: currentY });
    for (let i = 1; i < segments; i++) {
      const progress = i / segments;
      const targetY = startY + (y - startY) * progress;
      const offsetX = (Math.random() * 40 - 20);
      currentX = x + offsetX;
      currentY = targetY;
      points.push({ x: currentX, y: currentY });
    }
    points.push({ x: x, y: y });

    this.lightnings.push({
      points: points,
      radius: radius,
      color: isEvo ? '#00f5ff' : '#ffe600',
      life: 0.22,
      maxLife: 0.22,
    });
  }

  draw(ctx, camera) {
    // 繪製雷擊
    for (const l of this.lightnings) {
      const alpha = Math.max(0, l.life / l.maxLife);
      ctx.save();
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 4 * alpha;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 12;

      ctx.beginPath();
      for (let i = 0; i < l.points.length; i++) {
        const px = l.points[i].x - camera.x;
        const py = l.points[i].y - camera.y;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // 地面落雷光環
      ctx.fillStyle = l.color;
      ctx.globalAlpha = 0.3 * alpha;
      ctx.beginPath();
      ctx.arc(l.points[l.points.length - 1].x - camera.x, l.points[l.points.length - 1].y - camera.y, l.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 繪製粒子與衝擊波。
    // 原本每顆自己 save/restore 一次（900 顆 = 1800 次狀態指令），但兩個分支各自
    // 都把自己用到的屬性 (fillStyle/strokeStyle/lineWidth/globalAlpha) 設滿，
    // 所以整段包一組 save/restore 就等價 —— 繪製順序與混合結果完全不變。
    ctx.save();
    for (const p of this.particles) {
      const screenX = p.x - camera.x;
      const screenY = p.y - camera.y;
      const alpha = Math.max(0, p.life / p.maxLife);

      if (p.type === 'shockwave') {
        const curR = p.radius + (p.maxRadius - p.radius) * (1 - alpha);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * alpha;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(screenX, screenY, curR, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(screenX, screenY, p.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 繪製浮動傷害跳字：依大小分三桶，每桶只設一次 canvas font。
    // (canvas 切字型會清 glyph cache，大量跳字時逐顆設定是主要的繪製成本)
    // 桶與字型都是模組常數，不再每幀重新配置陣列。
    // 走訪順序照環狀緩衝的年齡順序 (最舊→最新)，重疊時的疊放次序與原本相同。
    const texts = this.damageTexts;
    const head = this._dtHead;
    const total = texts.length;
    for (let b = 0; b < 3; b++) TEXT_BUCKETS[b].length = 0;
    for (let k = 0; k < total; k++) {
      const dt = texts[(head + k) % total];
      if (dt.life <= 0) continue;   // 死槽
      TEXT_BUCKETS[dt.bucket || 0].push(dt);
    }
    for (let b = 0; b < 3; b++) {
      const list = TEXT_BUCKETS[b];
      if (list.length === 0) continue;
      ctx.save();
      ctx.font = TEXT_FONTS[b];
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      for (const dt of list) {
        const screenX = dt.x - camera.x;
        const screenY = dt.y - camera.y;
        const alpha = Math.max(0, dt.life / dt.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = dt.color;
        ctx.strokeText(dt.text, screenX, screenY);
        ctx.fillText(dt.text + (dt.suffix || ''), screenX, screenY);
      }
      ctx.restore();
    }
  }

  clear() {
    this.particles = [];
    this.damageTexts = [];
    this._dtHead = 0;
    this._dtCount = 0;
    this.lightnings = [];
  }
}
