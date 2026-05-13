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
