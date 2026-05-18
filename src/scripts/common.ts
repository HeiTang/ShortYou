type FormValue = string | number | boolean | undefined | null;

export type FormPayload = Record<string, FormValue>;

export function getById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function setCurrentYear(selector = '[data-current-year]'): void {
  const yearNode = document.querySelector<HTMLElement>(selector);
  if (yearNode) yearNode.textContent = String(new Date().getFullYear());
}

export function readDecodedHash(): string {
  return decodeURIComponent((window.location.hash || '').replace(/^#/, ''));
}

export async function fetchIPFromCloudflare(): Promise<string> {
  try {
    const trace = await fetch('https://www.cloudflare.com/cdn-cgi/trace').then((response) => response.text());
    const row = trace.split('\n').find((line) => line.startsWith('ip='));
    return row ? row.replace('ip=', '') : '';
  } catch {
    return '';
  }
}

export async function postForm<T>(url: string, data: FormPayload): Promise<T> {
  const body = new URLSearchParams();
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') {
      body.append(key, String(value));
    }
  });

  const response = await fetch(url, { method: 'POST', body });
  return response.json() as Promise<T>;
}

class TxtRotate {
  private loopNum = 0;

  private txt = '';

  private isDeleting = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly toRotate: string[],
    private readonly period: number
  ) {
    this.tick();
  }

  private tick(): void {
    const i = this.loopNum % this.toRotate.length;
    const fullTxt = this.toRotate[i];

    this.txt = this.isDeleting
      ? fullTxt.substring(0, this.txt.length - 1)
      : fullTxt.substring(0, this.txt.length + 1);
    this.el.innerHTML = this.txt;

    let delta = this.isDeleting ? 100 : 200;
    if (!this.isDeleting && this.txt === fullTxt) {
      delta = this.period;
      this.isDeleting = true;
    } else if (this.isDeleting && this.txt === '') {
      this.isDeleting = false;
      this.loopNum += 1;
      delta = 400;
    }

    window.setTimeout(() => this.tick(), delta);
  }
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?';

export function scrambleText(
  el: HTMLElement,
  target: string,
  opts: { duration?: number; onDone?: () => void } = {}
): void {
  const duration = opts.duration ?? 1200;
  const len = target.length;
  const perChar = duration / len;
  let resolved = 0;
  let frame = 0;
  let prevResolved = 0;

  const randChar = (): string => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];

  const render = (justLocked: number): void => {
    el.innerHTML = '';
    const dataChars: string[] = [];
    for (let i = 0; i < len; i++) {
      const span = document.createElement('span');
      if (i < resolved) {
        span.textContent = target[i];
        dataChars.push(target[i]);
        if (i === justLocked) span.className = 'char-lock';
      } else {
        const c = randChar();
        span.textContent = c;
        span.className = 'char-rand';
        dataChars.push(c);
      }
      el.appendChild(span);
    }
    el.setAttribute('data-text', dataChars.join(''));
  };

  const tick = (): void => {
    frame++;
    const elapsed = frame * 30;
    const nextResolved = Math.min(Math.floor(elapsed / perChar), len);
    const locked = nextResolved > prevResolved ? nextResolved - 1 : -1;
    if (nextResolved > resolved) resolved = nextResolved;
    prevResolved = nextResolved;
    render(locked);
    if (resolved < len) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = target;
      el.setAttribute('data-text', target);
      opts.onDone?.();
    }
  };

  requestAnimationFrame(tick);
}

export function initMatrixRain(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  let animId = 0;
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
  const fontSize = 14;
  let columns = 0;
  let drops: number[] = [];

  const resize = (): void => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.floor(canvas.width / fontSize);
    drops = Array.from({ length: columns }, () => Math.random() * -100);
  };

  const draw = (): void => {
    ctx.fillStyle = 'rgba(10, 10, 12, 0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < columns; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      const brightness = Math.random();
      if (brightness > 0.95) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
      } else if (brightness > 0.8) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      }

      ctx.fillText(char, x, y);

      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += 0.6 + Math.random() * 0.4;
    }

    animId = requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener('resize', resize);
  draw();

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', resize);
  };
}

export function initTxtRotate(className = 'txt-rotate'): void {
  const elements = document.getElementsByClassName(className);
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i] as HTMLElement;
    const rotateData = el.getAttribute('data-rotate');
    const period = Number.parseInt(el.getAttribute('data-period') || '2000', 10);
    if (!rotateData) continue;

    try {
      const toRotate = JSON.parse(rotateData) as string[];
      new TxtRotate(el, toRotate, period || 2000);
    } catch {
      // Ignore malformed rotate payloads to avoid breaking page boot.
    }
  }
}
