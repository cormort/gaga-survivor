// 粒子與視覺特效系統 (浮動傷害數字、爆炸火花、落雷電弧、受傷碎片)

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.damageTexts = [];
    this.lightnings = [];
  }

  update(dt) {
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
      p.vx *= Math.pow(p.friction || 0.92, dt * 60);
      p.vy *= Math.pow(p.friction || 0.92, dt * 60);
    }

    // 更新傷害數字
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const dtText = this.damageTexts[i];
      dtText.life -= dt;
      if (dtText.life <= 0) {
        this.damageTexts.splice(i, 1);
        continue;
      }
      dtText.y -= 25 * dt; // 向上漂浮
      dtText.scale = Math.max(0.8, dtText.scale * 0.98);
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
    const displayText = typeof text === 'number' ? String(Math.round(text)) : String(text);
    this.damageTexts.push({
      x: x + (Math.random() * 16 - 8),
      y: y - 10 + (Math.random() * 10 - 5),
      text: displayText,
      isCrit: isCrit,
      life: 0.65,
      maxLife: 0.65,
      scale: isRealCrit ? 1.9 : isCrit ? 1.4 : 1.0,
      color: isRealCrit ? '#ff3860' : isCrit ? '#ffb703' : '#ffffff',
      suffix: isRealCrit ? '!' : '',
    });
  }

  createDeathParticles(x, y, color = '#38b000', count = 8) {
    for (let i = 0; i < count; i++) {
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
    // 衝擊波環
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

    // 破片與火花
    const count = isEvo ? 24 : 14;
    for (let i = 0; i < count; i++) {
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

  createLightning(x, y, radius, isEvo = false) {
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

    // 繪製粒子與衝擊波
    for (const p of this.particles) {
      const screenX = p.x - camera.x;
      const screenY = p.y - camera.y;
      const alpha = Math.max(0, p.life / p.maxLife);

      if (p.type === 'shockwave') {
        const curR = p.radius + (p.maxRadius - p.radius) * (1 - alpha);
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * alpha;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(screenX, screenY, curR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(screenX, screenY, p.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 繪製浮動傷害跳字
    for (const dt of this.damageTexts) {
      const screenX = dt.x - camera.x;
      const screenY = dt.y - camera.y;
      const alpha = Math.max(0, dt.life / dt.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(14 * dt.scale)}px 'Chakra Petch', sans-serif`;
      ctx.fillStyle = dt.color;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(dt.text, screenX, screenY);
      ctx.fillText(dt.text + (dt.suffix || ''), screenX, screenY);
      ctx.restore();
    }
  }

  clear() {
    this.particles = [];
    this.damageTexts = [];
    this.lightnings = [];
  }
}
