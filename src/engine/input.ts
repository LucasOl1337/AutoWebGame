import type { Direction, MenuPlayerId } from "../core/types";
import { KEY_BINDINGS, SKILL_KEY } from "../core/config";

export interface InputController {
  consumePress(code: string): boolean;
  endFrame(): void;
  clearPresses(): void;
  isDown(code: string): boolean;
  getMovementDirection(playerId: MenuPlayerId): Direction | null;
}

export class InputManager {
  private keysDown = new Set<string>();
  private pressCounts = new Map<string, number>();
  private keyOrder: string[] = [];
  private readonly reservedCodes = new Set<string>([
    KEY_BINDINGS[1].up,
    KEY_BINDINGS[1].down,
    KEY_BINDINGS[1].left,
    KEY_BINDINGS[1].right,
    KEY_BINDINGS[1].bomb,
    KEY_BINDINGS[1].detonate,
    KEY_BINDINGS[1].ready,
    KEY_BINDINGS[2].up,
    KEY_BINDINGS[2].down,
    KEY_BINDINGS[2].left,
    KEY_BINDINGS[2].right,
    KEY_BINDINGS[2].bomb,
    KEY_BINDINGS[2].detonate,
    KEY_BINDINGS[2].ready,
    SKILL_KEY,
    "Space",
    "Enter",
    "Escape",
    "KeyB",
    "KeyN",
    "KeyG",
    "KeyK",
  ]);

  constructor(target: Window) {
    target.addEventListener("keydown", (event) => {
      if (this.isTypingTarget(event.target)) {
        return;
      }
      const code = event.code;
      if (this.reservedCodes.has(code)) {
        event.preventDefault();
      }
      if (!this.keysDown.has(code)) {
        this.pressCounts.set(code, (this.pressCounts.get(code) ?? 0) + 1);
      }
      this.keysDown.add(code);
      this.keyOrder = this.keyOrder.filter((item) => item !== code);
      this.keyOrder.push(code);
    });

    target.addEventListener("keyup", (event) => {
      const code = event.code;
      this.keysDown.delete(code);
      this.keyOrder = this.keyOrder.filter((item) => item !== code);
    });

    target.addEventListener("blur", () => {
      this.keysDown.clear();
      this.pressCounts.clear();
      this.keyOrder = [];
    });
  }

  public consumePress(code: string): boolean {
    const count = this.pressCounts.get(code) ?? 0;
    if (count <= 0) {
      return false;
    }
    if (count === 1) {
      this.pressCounts.delete(code);
    } else {
      this.pressCounts.set(code, count - 1);
    }
    return true;
  }

  public endFrame(): void {
    // Presses are queued until consumed so fixed-step updates do not miss short taps.
  }

  public clearPresses(): void {
    this.pressCounts.clear();
  }

  public isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public getMovementDirection(playerId: MenuPlayerId): Direction | null {
    const binding = KEY_BINDINGS[playerId];
    const options: Array<{ code: string; direction: Direction }> = [
      { code: binding.up, direction: "up" },
      { code: binding.down, direction: "down" },
      { code: binding.left, direction: "left" },
      { code: binding.right, direction: "right" },
    ];

    for (let index = this.keyOrder.length - 1; index >= 0; index -= 1) {
      const code = this.keyOrder[index];
      const match = options.find((option) => option.code === code && this.keysDown.has(option.code));
      if (match) {
        return match.direction;
      }
    }

    return null;
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable) {
      return true;
    }
    return (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement)
      || (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement)
      || (typeof HTMLSelectElement !== "undefined" && target instanceof HTMLSelectElement);
  }
}

export class NoopInputManager implements InputController {
  public consumePress(): boolean {
    return false;
  }

  public endFrame(): void {
    // Intentionally empty for headless runtimes.
  }

  public clearPresses(): void {
    // Intentionally empty for headless runtimes.
  }

  public isDown(): boolean {
    return false;
  }

  public getMovementDirection(): Direction | null {
    return null;
  }
}
