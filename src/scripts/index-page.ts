import { createAliasUIController } from './alias-ui';
import { humanizeBackendError } from './backend-messages';
import { fetchIPFromCloudflare, getById, initTxtRotate, postForm, readDecodedHash, setCurrentYear } from './common';

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

  const redirectPanel = getById<HTMLElement>('redirectPanel');
  const inputUrl = getById<HTMLInputElement>('url');
  const inputAlias = getById<HTMLInputElement>('alias');
  const aliasToggle = getById<HTMLButtonElement>('aliasToggle');
  const aliasPanel = getById<HTMLElement>('aliasPanel');
  const aliasWrap = getById<HTMLElement>('aliasWrap');
  const submitButton = getById<HTMLButtonElement>('btn');
  const turnstileWrap = getById<HTMLElement>('turnstileWidget');
  const modeHint = getById<HTMLElement>('modeHint');
  const resultNode = getById<HTMLElement>('result');
  const toast = getById<HTMLElement>('toast');

  if (
    !redirectPanel ||
    !inputUrl ||
    !inputAlias ||
    !aliasToggle ||
    !aliasPanel ||
    !aliasWrap ||
    !submitButton ||
    !turnstileWrap ||
    !modeHint ||
    !resultNode ||
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
      submitButton.textContent = 'Create';
      submitButton.disabled = !(valid && turnstileVerified);
      return;
    }

    submitButton.textContent = 'Shorten';
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
    history.replaceState({}, '', '/');
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
    redirectPanel.classList.remove('hidden');
    fetch(`${api}?query=${encodeURIComponent(hash)}`)
      .then((response) => response.json() as Promise<ResolveResponse>)
      .then((json) => {
        window.location.href = json && json.success && json.result ? json.result : pageBase;
      })
      .catch(() => {
        window.location.href = pageBase;
      });
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

        resultNode.innerText = `${pageBase}#${data.result}`;
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
    resultNode.innerText = `${pageBase}#${alias}`;
    showToast('Preview only. Fixed mock result returned without calling create API.', 'success');
  });

  updateModeHint();
  updateSubmitState();
  initTxtRotate();
}
