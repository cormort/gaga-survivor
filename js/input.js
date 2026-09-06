// 輸入控制器 (鍵盤 WASD / 方向鍵 + 觸控 / 滑鼠虛擬搖桿)

export class InputController {
  constructor() {
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    // 向量輸出 (-1 ~ 1)
    this.vector = { x: 0, y: 0 };
    this.isMoving = false;

    // 虛擬搖桿元素與狀態
    this.zone = document.getElementById('joystick-zone');
    this.base = document.getElementById('joystick-base');
    this.stick = document.getElementById('joystick-stick');

    this.joystickActive = false;
    this.touchId = null;
    this.baseRect = null;
    this.maxRadius = 45; // 搖桿最大位移半徑

    this.initKeyboard();
    this.initJoystick();
    this.onDash = null;
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'arrowup'].includes(key)) this.keys.up = true;
      if (['s', 'arrowdown'].includes(key)) this.keys.down = true;
      if (['a', 'arrowleft'].includes(key)) this.keys.left = true;
      if (['d', 'arrowright'].includes(key)) this.keys.right = true;
      if (e.code === 'Space' || key === ' ') {
        // 聚焦在按鈕/輸入框時保留原生鍵盤行為 (選單按鈕用 Space 啟動)，不攔截也不翻滾
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        this.onDash?.();
      }
      this.updateKeyboardVector();
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'arrowup'].includes(key)) this.keys.up = false;
      if (['s', 'arrowdown'].includes(key)) this.keys.down = false;
      if (['a', 'arrowleft'].includes(key)) this.keys.left = false;
      if (['d', 'arrowright'].includes(key)) this.keys.right = false;
      this.updateKeyboardVector();
    });
  }

  updateKeyboardVector() {
    if (this.joystickActive) return; // 搖桿優先

    let vx = 0;
    let vy = 0;

    if (this.keys.left) vx -= 1;
    if (this.keys.right) vx += 1;
    if (this.keys.up) vy -= 1;
    if (this.keys.down) vy += 1;

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      this.vector.x = vx / len;
      this.vector.y = vy / len;
      this.isMoving = true;
    } else {
      this.vector.x = 0;
      this.vector.y = 0;
      this.isMoving = false;
    }
  }

  initJoystick() {
    if (!this.zone || !this.base || !this.stick) return;

    const onStart = (clientX, clientY, identifier = null) => {
      this.joystickActive = true;
      this.touchId = identifier;
      this.baseRect = this.base.getBoundingClientRect();
      this.handleMove(clientX, clientY);
    };

    const onMove = (clientX, clientY) => {
      if (!this.joystickActive) return;
      this.handleMove(clientX, clientY);
    };

    const onEnd = () => {
      this.joystickActive = false;
      this.touchId = null;
      this.stick.style.transform = `translate(0px, 0px)`;
      // 放手後搖桿回到 CSS 預設的左下角位置
      this.zone.style.left = '';
      this.zone.style.top = '';
      this.zone.style.right = '';
      this.zone.style.bottom = '';
      this.updateKeyboardVector();
    };

    // 手機上把搖桿搬到手指按下的位置 (動態搖桿)，比固定角落好按很多
    const moveZoneTo = (clientX, clientY) => {
      const w = this.zone.offsetWidth;
      const h = this.zone.offsetHeight;
      const x = Math.max(w / 2 + 4, Math.min(window.innerWidth - w / 2 - 4, clientX));
      const y = Math.max(h / 2 + 4, Math.min(window.innerHeight - h / 2 - 4, clientY));
      this.zone.style.left = `${x - w / 2}px`;
      this.zone.style.top = `${y - h / 2}px`;
      this.zone.style.right = 'auto';
      this.zone.style.bottom = 'auto';
    };

    // 觸控事件
    this.zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      onStart(touch.clientX, touch.clientY, touch.identifier);
    }, { passive: false });

    // 畫布任一處按下都能操控：搖桿直接跳到指尖 (避開 HUD 按鈕等互動元件)
    document.addEventListener('touchstart', (e) => {
      if (this.joystickActive) return;
      const t = e.changedTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el || el.closest('button, .overlay, #hud')) return;
      if (this.zone.contains(el)) return;

      e.preventDefault();
      moveZoneTo(t.clientX, t.clientY);
      onStart(t.clientX, t.clientY, t.identifier);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchId) {
          onMove(touch.clientX, touch.clientY);
          break;
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchId) {
          onEnd();
          break;
        }
      }
    });

    // 滑鼠拖曳支援
    this.zone.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onStart(e.clientX, e.clientY);

      const mouseMoveHandler = (ev) => onMove(ev.clientX, ev.clientY);
      const mouseUpHandler = () => {
        onEnd();
        window.removeEventListener('mousemove', mouseMoveHandler);
        window.removeEventListener('mouseup', mouseUpHandler);
      };

      window.addEventListener('mousemove', mouseMoveHandler);
      window.addEventListener('mouseup', mouseUpHandler);
    });
  }

  handleMove(clientX, clientY) {
    if (!this.baseRect) return;
    const centerX = this.baseRect.left + this.baseRect.width / 2;
    const centerY = this.baseRect.top + this.baseRect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) {
      this.vector.x = 0;
      this.vector.y = 0;
      this.isMoving = false;
      this.stick.style.transform = `translate(0px, 0px)`;
      return;
    }

    const clampedDist = Math.min(dist, this.maxRadius);
    const nx = dx / dist;
    const ny = dy / dist;

    // 更新搖桿棍視覺
    this.stick.style.transform = `translate(${nx * clampedDist}px, ${ny * clampedDist}px)`;

    // 更新位移輸出
    this.vector.x = nx;
    this.vector.y = ny;
    this.isMoving = true;
  }

  reset() {
    this.keys = { up: false, down: false, left: false, right: false };
    this.vector = { x: 0, y: 0 };
    this.isMoving = false;
    this.joystickActive = false;
    if (this.stick) {
      this.stick.style.transform = `translate(0px, 0px)`;
    }
  }
}
