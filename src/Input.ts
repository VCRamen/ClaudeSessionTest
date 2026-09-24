// キーボード・マウス入力の管理（ポインタロック対応）

export class Input {
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  wheelSteps = 0;
  isLeftDown = false;
  isRightDown = false;
  isLeftPressed = false;
  isLocked = false;

  private readonly element: HTMLElement;
  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly lockListeners: ((isLocked: boolean) => void)[] = [];

  constructor(element: HTMLElement) {
    this.element = element;

    window.addEventListener('keydown', (event) => {
      if (this.isLocked && (event.code === 'Space' || event.code.startsWith('Digit') || event.code === 'Tab')) {
        event.preventDefault();
      }
      if (!event.repeat) {
        this.keysPressed.add(event.code);
      }
      this.keysDown.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.keysDown.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.isLeftDown = false;
      this.isRightDown = false;
    });

    document.addEventListener('mousemove', (event) => {
      if (!this.isLocked) return;
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    });
    document.addEventListener('mousedown', (event) => {
      if (!this.isLocked) return;
      if (event.button === 0) {
        this.isLeftDown = true;
        this.isLeftPressed = true;
      } else if (event.button === 2) {
        this.isRightDown = true;
      }
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.isLeftDown = false;
      if (event.button === 2) this.isRightDown = false;
    });
    document.addEventListener('contextmenu', (event) => {
      if (this.isLocked) event.preventDefault();
    });
    document.addEventListener(
      'wheel',
      (event) => {
        if (!this.isLocked) return;
        event.preventDefault();
        this.wheelSteps += Math.sign(event.deltaY);
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.element;
      if (!this.isLocked) {
        this.isLeftDown = false;
        this.isRightDown = false;
      }
      for (const listener of this.lockListeners) listener(this.isLocked);
    });
  }

  OnLockChange(listener: (isLocked: boolean) => void): void {
    this.lockListeners.push(listener);
  }

  RequestLock(): void {
    try {
      const result = this.element.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          // 直前に解除した直後などはブラウザに拒否されることがある
        });
      }
    } catch {
      // 失敗してもクリックで再試行できる
    }
  }

  ExitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  IsDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  WasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  /** 押されたスロット番号キー（0始まり）。押されていなければ -1 */
  GetPressedSlotKey(): number {
    for (let i = 0; i < 4; i++) {
      if (this.keysPressed.has(`Digit${i + 1}`) || this.keysPressed.has(`Numpad${i + 1}`)) return i;
    }
    return -1;
  }

  EndFrame(): void {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheelSteps = 0;
    this.isLeftPressed = false;
    this.keysPressed.clear();
  }
}
