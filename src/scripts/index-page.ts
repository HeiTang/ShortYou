import QRCode from 'qrcode';
import { createAliasUIController } from './alias-ui';
import { humanizeBackendError } from './backend-messages';
import { fetchIPFromCloudflare, getById, initMatrixRain, initTxtRotate, postForm, readDecodedHash, scrambleText, setCurrentYear } from './common';

type IndexPageConfig = {
  api: string;
  turnstileSiteKey?: string;
};

type ResolveResponse = {
  success?: boolean;
  result?: string;
};

type ApiResult = {
  success: boolean;
  result?: string;
  error?: string;
  'error-codes'?: string[];
};

type ToastType = 'warn' | 'success' | 'error';

type TurnstileApi = NonNullable<Window['turnstile']>;

export function initIndexPage(config: IndexPageConfig): void {
  if (!config || !config.api) return;

  const api = config.api;
  const turnstileSiteKey = config.turnstileSiteKey;
  const pageBase = `${window.location.origin}${window.location.pathname}`;
  const hash = readDecodedHash();

  setCurrentYear();

  const redirectOverlay = getById<HTMLElement>('redirectOverlay');
  const redirectLabel = getById<HTMLElement>('redirectLabel');
  const redirectAlias = getById<HTMLElement>('redirectAlias');
  const redirectDest = getById<HTMLElement>('redirectDest');
  const redirectBar = getById<HTMLElement>('redirectBar');
  const inputUrl = getById<HTMLInputElement>('url');
  const inputAlias = getById<HTMLInputElement>('alias');
  const aliasToggle = getById<HTMLButtonElement>('aliasToggle');
  const aliasPanel = getById<HTMLElement>('aliasPanel');
  const aliasWrap = getById<HTMLElement>('aliasWrap');
  const submitButton = getById<HTMLButtonElement>('btn');
  const turnstileWrap = getById<HTMLElement>('turnstileWidget');
  const modeHint = getById<HTMLElement>('modeHint');
  const resultCard = getById<HTMLElement>('resultCard');
  const resultLink = getById<HTMLAnchorElement>('resultLink');
  const copyBtn = getById<HTMLButtonElement>('copyBtn');
  const qrBtn = getById<HTMLButtonElement>('qrBtn');
  const qrContainer = getById<HTMLElement>('qrContainer');
  const qrCanvas = getById<HTMLCanvasElement>('qrCanvas');
  const toast = getById<HTMLElement>('toast');

  if (
    !redirectOverlay ||
    !inputUrl ||
    !inputAlias ||
    !aliasToggle ||
    !aliasPanel ||
    !aliasWrap ||
    !submitButton ||
    !turnstileWrap ||
    !modeHint ||
    !resultCard ||
    !resultLink ||
    !copyBtn ||
    !qrBtn ||
    !qrContainer ||
    !qrCanvas ||
    !toast
  ) {
    return;
  }

  let capabilityToken = '';
  let turnstileToken = '';
  let turnstileVerified = false;
  let ip = '';
  let toastTimer = 0;
  let turnstileScriptLoaded = false;
  let turnstileWidgetId = '';

  let currentShortUrl = '';

  const showResult = (url: string): void => {
    currentShortUrl = url;
    resultLink.href = url;
    resultLink.textContent = url;
    resultCard.classList.remove('hidden');
    qrContainer.classList.remove('is-open');
  };

  const aliasController = createAliasUIController({
    inputAlias,
    aliasToggle,
    aliasPanel,
    aliasWrap
  });

  const showToast = (text: string, type: ToastType = 'warn'): void => {
    if (!text) {
      toast.classList.remove('show', 'success', 'error', 'warn');
      toast.textContent = '';
      return;
    }

    toast.classList.remove('success', 'error', 'warn');
    toast.classList.add(type === 'error' ? 'error' : type === 'success' ? 'success' : 'warn', 'show');
    toast.textContent = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 2600);
  };

  const getTurnstileApi = (): TurnstileApi | null => {
    const candidate = window.turnstile;
    if (!candidate) return null;
    if (typeof candidate.render !== 'function' || typeof candidate.reset !== 'function') return null;
    return candidate;
  };

  const isAuthorizedMode = (): boolean => capabilityToken.length > 0;

  const updateModeHint = (): void => {
    modeHint.textContent = isAuthorizedMode()
      ? 'Authorized mode: real short links will be created after verification.'
      : 'Playground only: this page returns a mock result and does not call the create API.';
  };

  const updateSubmitState = (): void => {
    const valid = inputUrl.value.trim().startsWith('http');
    aliasController.syncSubmitButton(submitButton, valid);
    if (isAuthorizedMode()) {
      submitButton.textContent = 'Short it !';
      submitButton.disabled = !(valid && turnstileVerified);
      return;
    }

    submitButton.textContent = 'Short it !';
    submitButton.disabled = !valid;
  };

  const clearTurnstileState = (): void => {
    turnstileVerified = false;
    turnstileToken = '';
    updateSubmitState();
  };

  const resetTurnstileWidget = (): void => {
    clearTurnstileState();
    const turnstileApi = getTurnstileApi();
    if (turnstileWidgetId && turnstileApi) {
      turnstileApi.reset(turnstileWidgetId);
    }
  };

  const renderTurnstileWidget = (): void => {
    const turnstileApi = getTurnstileApi();
    if (!turnstileSiteKey || !turnstileApi || turnstileWidgetId) return;

    turnstileWrap.innerHTML = '';
    turnstileWidgetId = turnstileApi.render(turnstileWrap, {
      sitekey: turnstileSiteKey,
      theme: 'dark',
      callback: (token: string) => {
        turnstileToken = token;
        turnstileVerified = true;
        updateSubmitState();
        showToast('Cloudflare Turnstile verified.', 'success');
      },
      'expired-callback': () => {
        resetTurnstileWidget();
        showToast('Cloudflare Turnstile 已過期，請重新驗證。', 'warn');
      },
      'error-callback': () => {
        resetTurnstileWidget();
        showToast(humanizeBackendError('captcha_failed'), 'error');
      }
    });
  };

  const setupTurnstile = (): void => {
    if (!turnstileSiteKey) {
      showToast('Missing Cloudflare Turnstile site key.', 'error');
      return;
    }

    turnstileWrap.classList.remove('hidden');
    if (getTurnstileApi()) {
      renderTurnstileWidget();
      return;
    }
    if (turnstileScriptLoaded) return;

    window.onTurnstileApiLoad = () => {
      renderTurnstileWidget();
    };

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileApiLoad';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    turnstileScriptLoaded = true;
  };

  const enterAuthorizedMode = (token: string): void => {
    capabilityToken = token;
    history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    setupTurnstile();
    updateModeHint();
    updateSubmitState();
    showToast('Authorized mode enabled.', 'success');
    void fetchIPFromCloudflare().then((detectedIp) => {
      ip = detectedIp;
    });
  };

  const previewAlias = (): string => 'demo-preview';

  // 保留 `t=` 命名空間給 capability token，避免與一般 alias 流程混用。
  if (hash.startsWith('t=')) {
    const tokenFromHash = hash.slice(2).trim();
    if (!tokenFromHash) {
      window.location.href = pageBase;
      return;
    }

    enterAuthorizedMode(tokenFromHash);
  }

  if (hash && !hash.startsWith('t=')) {
    document.documentElement.classList.add('is-redirecting');

    const matrixCanvas = getById<HTMLCanvasElement>('matrixCanvas');
    if (matrixCanvas) initMatrixRain(matrixCanvas);

    const aliasDisplay = `#${hash}`;
    if (redirectAlias) {
      scrambleText(redirectAlias, aliasDisplay, { duration: 1000 });
    }

    const launchTo = (url: string): void => {
      redirectOverlay.classList.add('launch');
      setTimeout(() => { window.location.href = url; }, 500);
    };

    const showDest = (dest: string): void => {
      if (redirectLabel) redirectLabel.textContent = 'destination';
      if (redirectBar) redirectBar.classList.add('redirect-bar-done');
      if (redirectDest) {
        scrambleText(redirectDest, dest, {
          duration: 600,
          onDone: () => { setTimeout(() => launchTo(dest), 400); }
        });
      } else {
        launchTo(dest);
      }
    };

    const showError = (msg: string): void => {
      if (redirectLabel) redirectLabel.textContent = 'error';
      if (redirectDest) scrambleText(redirectDest, msg, { duration: 300 });
      setTimeout(() => { window.location.href = pageBase; }, 1500);
    };

    if (hash === 'demo-preview') {
      showDest('https://github.com/HeiTang/ShortYou');
    } else {
      fetch(`${api}?query=${encodeURIComponent(hash)}`)
        .then((response) => response.json() as Promise<ResolveResponse>)
        .then((json) => {
          if (json && json.success && json.result) {
            showDest(json.result);
          } else {
            showError('link not found');
          }
        })
        .catch(() => {
          showError('something went wrong');
        });
    }
    return;
  }

  inputUrl.addEventListener('input', () => {
    updateSubmitState();
  });

  aliasToggle.addEventListener('click', () => {
    aliasController.toggle();
    updateSubmitState();
  });

  submitButton.addEventListener('click', async () => {
    const url = inputUrl.value.trim();
    if (!url.startsWith('http')) return;

    if (isAuthorizedMode()) {
      if (!turnstileVerified || !turnstileToken) {
        showToast('Please complete Cloudflare Turnstile first.', 'error');
        return;
      }

      const submittedToken = turnstileToken;

      try {
        const data = await postForm<ApiResult>(api, {
          action: 'create',
          url,
          alias: aliasController.isOpen() ? inputAlias.value || undefined : undefined,
          capabilityToken,
          token: submittedToken,
          ip
        });

        if (!data.success || !data.result) {
          const detailedError = (data['error-codes'] && data['error-codes'][0]) || data.error;
          showToast(humanizeBackendError(detailedError, '建立短網址失敗，請稍後再試。'), 'error');
          return;
        }

        showResult(`${pageBase}#${data.result}`);
        showToast('Create success.', 'success');
        return;
      } catch {
        showToast(humanizeBackendError('create_failed'), 'error');
        return;
      } finally {
        resetTurnstileWidget();
      }
    }

    const alias = previewAlias();
    showResult(`${pageBase}#${alias}`);
    showToast('Preview only. Fixed mock result returned without calling create API.', 'success');
  });

  copyBtn.addEventListener('click', async () => {
    if (!currentShortUrl) return;
    try {
      await navigator.clipboard.writeText(currentShortUrl);
      showToast('Copied!', 'success');
    } catch {
      showToast('複製失敗', 'error');
    }
  });

  qrBtn.addEventListener('click', async () => {
    if (!currentShortUrl) return;
    if (qrContainer.classList.contains('is-open')) {
      qrContainer.classList.remove('is-open');
      return;
    }
    try {
      await QRCode.toCanvas(qrCanvas, currentShortUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#e2e8f0', light: '#00000000' }
      });
      qrContainer.classList.add('is-open');
    } catch {
      showToast('QR Code 生成失敗', 'error');
    }
  });

  updateModeHint();
  updateSubmitState();
  initTxtRotate();
}
