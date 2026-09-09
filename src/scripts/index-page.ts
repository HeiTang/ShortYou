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

type TurnstileApi = NonNullable<Window['turnstile']>;

let toastTimer = 0;

export function showToast(text: string, isError = false): void {
  const toast = getById<HTMLElement>('toast');
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.toggle('is-error', isError);
  toast.classList.toggle('show', Boolean(text));
  if (text) {
    toastTimer = window.setTimeout(() => showToast(''), 4000);
  }
}

export function initIndexPage(config: IndexPageConfig): void {
  if (!config || !config.api) {
    showToast('服務設定不完整，請稍後再試。', true);
    return;
  }

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
  const modeSummary = getById<HTMLElement>('modeSummary');
  const modeDescription = getById<HTMLElement>('modeDescription');
  const resultCard = getById<HTMLElement>('resultCard');
  const resultLink = getById<HTMLAnchorElement>('resultLink');
  const copyBtn = getById<HTMLButtonElement>('copyBtn');
  const qrBtn = getById<HTMLButtonElement>('qrBtn');
  const qrContainer = getById<HTMLElement>('qrContainer');
  const qrCanvas = getById<HTMLCanvasElement>('qrCanvas');
  const toast = getById<HTMLElement>('toast');
  const resultFeedback = getById<HTMLElement>('resultFeedback');

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
    !modeSummary ||
    !modeDescription ||
    !resultCard ||
    !resultLink ||
    !copyBtn ||
    !qrBtn ||
    !qrContainer ||
    !qrCanvas ||
    !toast ||
    !resultFeedback
  ) {
    return;
  }

  let capabilityToken = '';
  let turnstileToken = '';
  let turnstileVerified = false;
  let ip = '';
  let copyTimer = 0;
  let turnstileScriptLoaded = false;
  let turnstileWidgetId = '';

  let currentShortUrl = '';

  const showResult = (url: string): void => {
    window.clearTimeout(copyTimer);
    copyBtn.classList.remove('is-copied');
    resultFeedback.textContent = '';
    showToast('');
    currentShortUrl = url;
    resultLink.href = url;
    resultLink.textContent = url;
    resultCard.classList.remove('hidden');
    if (!isAuthorizedMode()) modeHint.closest('details')?.classList.add('hidden');
    qrContainer.classList.remove('is-open');
  };

  const aliasController = createAliasUIController({
    inputAlias,
    aliasToggle,
    aliasPanel,
    aliasWrap
  });

  const clearFormFeedback = (): void => {
    inputUrl.removeAttribute('aria-invalid');
    inputAlias.removeAttribute('aria-invalid');
  };

  const showCreateError = (code: string | undefined): void => {
    const message = humanizeBackendError(code, '建立短網址失敗，請稍後再試。');
    if (code === 'invalid_url') {
      inputUrl.setAttribute('aria-invalid', 'true');
    } else if (code && ['alias_exists', 'invalid_alias', 'reserved_alias'].includes(code)) {
      aliasController.setOpen(true);
      inputAlias.setAttribute('aria-invalid', 'true');
    }
    showToast(message, true);
  };

  const getTurnstileApi = (): TurnstileApi | null => {
    const candidate = window.turnstile;
    if (!candidate) return null;
    if (typeof candidate.render !== 'function' || typeof candidate.reset !== 'function') return null;
    return candidate;
  };

  const isAuthorizedMode = (): boolean => capabilityToken.length > 0;

  const updateModeHint = (): void => {
    modeHint.textContent = isAuthorizedMode() ? 'Authorized mode' : 'Playground only';
    const description = isAuthorizedMode()
      ? 'Real short links will be created after verification.'
      : 'This page returns a mock result and does not call the create API.';
    modeSummary.title = description;
    modeDescription.textContent = description;
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
      },
      'expired-callback': () => {
        resetTurnstileWidget();
        showToast('Cloudflare Turnstile 已過期，請重新驗證。', true);
      },
      'error-callback': () => {
        resetTurnstileWidget();
        showToast(humanizeBackendError('captcha_failed'), true);
      }
    });
  };

  const setupTurnstile = (): void => {
    if (!turnstileSiteKey) {
      showToast('驗證服務尚未設定，暫時無法建立短網址。', true);
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
    script.addEventListener('error', () => {
      showToast('驗證服務載入失敗，請重新整理頁面再試。', true);
    });
    document.body.appendChild(script);
    turnstileScriptLoaded = true;
  };

  const enterAuthorizedMode = (token: string): void => {
    capabilityToken = token;
    history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    showToast('Authorized mode enabled.');
    setupTurnstile();
    updateModeHint();
    updateSubmitState();
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
      showToast(msg, true);
      setTimeout(() => { window.location.href = pageBase; }, 4000);
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
            showError('找不到這個短網址。');
          }
        })
        .catch(() => {
          showError('短網址查詢失敗，請稍後再試。');
        });
    }
    return;
  }

  inputUrl.addEventListener('input', () => {
    inputUrl.removeAttribute('aria-invalid');
    updateSubmitState();
  });

  inputAlias.addEventListener('input', () => {
    inputAlias.removeAttribute('aria-invalid');
  });

  aliasToggle.addEventListener('click', () => {
    aliasController.toggle();
    inputAlias.removeAttribute('aria-invalid');
    updateSubmitState();
  });

  submitButton.addEventListener('click', async () => {
    const url = inputUrl.value.trim();
    if (!url.startsWith('http')) return;
    clearFormFeedback();
    showToast('');

    if (isAuthorizedMode()) {
      if (!turnstileVerified || !turnstileToken) {
        showToast(humanizeBackendError('captcha_required'), true);
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
          showCreateError(detailedError);
          return;
        }

        showResult(`${pageBase}#${data.result}`);
        return;
      } catch {
        showCreateError('create_failed');
        return;
      } finally {
        resetTurnstileWidget();
      }
    }

    const alias = previewAlias();
    showResult(`${pageBase}#${alias}`);
  });

  copyBtn.addEventListener('click', async () => {
    if (!currentShortUrl) return;
    window.clearTimeout(copyTimer);
    copyBtn.classList.remove('is-copied');
    resultFeedback.textContent = '';
    try {
      await navigator.clipboard.writeText(currentShortUrl);
      copyBtn.classList.add('is-copied');
      resultFeedback.textContent = '已複製';
      copyTimer = window.setTimeout(() => {
        copyBtn.classList.remove('is-copied');
        resultFeedback.textContent = '';
      }, 2000);
    } catch {
      showToast('複製失敗，請選取連結手動複製。', true);
    }
  });

  qrBtn.addEventListener('click', async () => {
    if (!currentShortUrl) return;
    if (qrContainer.classList.contains('is-open')) {
      qrContainer.classList.remove('is-open');
      return;
    }
    window.clearTimeout(copyTimer);
    copyBtn.classList.remove('is-copied');
    resultFeedback.textContent = '';
    try {
      await QRCode.toCanvas(qrCanvas, currentShortUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#e2e8f0', light: '#00000000' }
      });
      qrContainer.classList.add('is-open');
    } catch {
      showToast('QR Code 生成失敗，請重試或複製連結。', true);
    }
  });

  updateModeHint();
  updateSubmitState();
  initTxtRotate();
}
