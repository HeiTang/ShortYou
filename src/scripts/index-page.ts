import { createAliasUIController } from './alias-ui';
import { getById, initTxtRotate, readDecodedHash, setCurrentYear } from './common';

type IndexPageConfig = {
  api: string;
};

type ResolveResponse = {
  success?: boolean;
  result?: string;
};

export function initIndexPage(config: IndexPageConfig): void {
  if (!config || !config.api) return;

  const api = config.api;
  const pageBase = `${window.location.origin}${window.location.pathname}`;
  const hash = readDecodedHash();

  setCurrentYear();

  const redirectPanel = getById<HTMLElement>('redirectPanel');
  const inputUrl = getById<HTMLInputElement>('url');
  const inputAlias = getById<HTMLInputElement>('alias');
  const aliasToggle = getById<HTMLButtonElement>('aliasToggle');
  const aliasPanel = getById<HTMLElement>('aliasPanel');
  const aliasWrap = getById<HTMLElement>('aliasWrap');
  const submitButton = getById<HTMLButtonElement>('btn');
  const resultNode = getById<HTMLElement>('result');

  if (
    !redirectPanel ||
    !inputUrl ||
    !inputAlias ||
    !aliasToggle ||
    !aliasPanel ||
    !aliasWrap ||
    !submitButton ||
    !resultNode
  ) {
    return;
  }

  const storageKey = 'shortyou_fake_links';

  const aliasController = createAliasUIController({
    inputAlias,
    aliasToggle,
    aliasPanel,
    aliasWrap
  });

  const readStore = (): Record<string, string> => {
    // Playground 模式只存 localStorage，不寫入後端。
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  };

  const writeStore = (data: Record<string, string>): void => {
    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  const randomAlias = (len = 6): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < len; i += 1) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  };

  const generateAlias = (requested: string): string => {
    const table = readStore();
    const base = requested || randomAlias();
    if (!table[base]) return base;

    let idx = 2;
    while (table[`${base}-${idx}`]) idx += 1;
    return `${base}-${idx}`;
  };

  const updatePlaygroundState = (): void => {
    const valid = inputUrl.value.trim().startsWith('http');
    aliasController.syncSubmitButton(submitButton, valid);
  };

  // 先判斷 capability token 分流，再做一般 alias 解析。
  if (hash.startsWith('t=')) {
    window.location.href = `/invite#${hash}`;
    return;
  }

  if (hash) {
    redirectPanel.classList.remove('hidden');
    const table = readStore();
    if (table[hash]) {
      window.location.href = table[hash];
    } else {
      fetch(`${api}?query=${encodeURIComponent(hash)}`)
        .then((response) => response.json() as Promise<ResolveResponse>)
        .then((json) => {
          window.location.href = json && json.success && json.result ? json.result : pageBase;
        })
        .catch(() => {
          window.location.href = pageBase;
        });
    }
    return;
  }

  inputUrl.addEventListener('input', updatePlaygroundState);
  aliasToggle.addEventListener('click', () => {
    aliasController.toggle();
    updatePlaygroundState();
  });

  submitButton.addEventListener('click', () => {
    const url = inputUrl.value.trim();
    if (!url.startsWith('http')) return;

    const table = readStore();
    const requested = aliasController.isOpen()
      ? inputAlias.value.trim().toLowerCase().replace(/\s+/g, '-')
      : '';
    const alias = generateAlias(requested);
    table[alias] = url;
    writeStore(table);
    resultNode.innerText = `${pageBase}#${alias}`;
  });

  updatePlaygroundState();
  initTxtRotate();
}
