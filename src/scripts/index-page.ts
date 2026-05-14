import { createAliasUIController } from './alias-ui';
import { humanizeBackendError } from './backend-messages';
import { fetchIPFromCloudflare, getById, initTxtRotate, postForm, readDecodedHash, setCurrentYear } from './common';

type IndexPageConfig = {
  api: string;
  recaptchaSiteKey?: string;
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

export function initIndexPage(config: IndexPageConfig): void {
  if (!config || !config.api) return;

  const api = config.api;
  const recaptchaSiteKey = config.recaptchaSiteKey;
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
  const recaptchaWrap = getById<HTMLElement>('recaptcha');
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
    !recaptchaWrap ||
    !modeHint ||
    !resultNode ||
    !toast
  ) {
    return;
  }

  let capabilityToken = '';
  let recaptchaToken = '';
  let captchaVerified = false;
  let ip = '';
  let toastTimer = 0;
  let recaptchaScriptLoaded = false;

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
      submitButton.disabled = !(valid && captchaVerified);
      return;
    }

    submitButton.textContent = 'Shorten';
    submitButton.disabled = !valid;
  };

  const resetCaptchaState = (): void => {
    captchaVerified = false;
    recaptchaToken = '';
    updateSubmitState();
  };

  const setupRecaptcha = (): void => {
    if (!recaptchaSiteKey) {
      showToast('Missing reCAPTCHA site key.', 'error');
      return;
    }

    recaptchaWrap.classList.remove('hidden');
    recaptchaWrap.innerHTML = `<div class="g-recaptcha" data-sitekey="${recaptchaSiteKey}" data-theme="dark" data-callback="verifyCallback"></div>`;
    if (recaptchaScriptLoaded) return;

    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    recaptchaScriptLoaded = true;
  };

  const enterAuthorizedMode = (token: string): void => {
    capabilityToken = token;
    history.replaceState({}, '', '/');
    setupRecaptcha();
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
    if (isAuthorizedMode() && !inputUrl.value.trim().startsWith('http')) {
      resetCaptchaState();
    }
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
      if (!captchaVerified || !recaptchaToken) {
        showToast('Please verify reCAPTCHA first.', 'error');
        return;
      }

      try {
        const data = await postForm<ApiResult>(api, {
          action: 'create',
          url,
          alias: aliasController.isOpen() ? inputAlias.value || undefined : undefined,
          capabilityToken,
          token: recaptchaToken,
          ip
        });

        if (!data.success || !data.result) {
          showToast(humanizeBackendError(data.error, '建立短網址失敗，請稍後再試。'), 'error');
          return;
        }

        resultNode.innerText = `${pageBase}#${data.result}`;
        showToast('Create success.', 'success');
        return;
      } catch {
        showToast(humanizeBackendError('create_failed'), 'error');
        return;
      }
    }

    const alias = previewAlias();
    resultNode.innerText = `${pageBase}#${alias}`;
    showToast('Preview only. Fixed mock result returned without calling create API.', 'success');
  });

  window.verifyCallback = (token: string) => {
    postForm<ApiResult>(api, { action: 'verify_captcha', token, ip })
      .then((result) => {
        if (!result.success) {
          resetCaptchaState();
          const captchaError = (result['error-codes'] || [result.error || 'captcha_failed'])[0];
          showToast(humanizeBackendError(captchaError, 'reCAPTCHA 驗證失敗，請再試一次。'), 'error');
          return;
        }

        recaptchaToken = token;
        captchaVerified = true;
        updateSubmitState();
        showToast('reCAPTCHA verified.', 'success');
      })
      .catch(() => {
        resetCaptchaState();
        showToast(humanizeBackendError('captcha_failed'), 'error');
      });
  };

  updateModeHint();
  updateSubmitState();
  initTxtRotate();
}
