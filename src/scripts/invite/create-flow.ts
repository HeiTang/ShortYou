import { postForm, readDecodedHash } from '../common';
import type { AliasUIController } from '../alias-ui';
import { humanizeInviteError } from './messages';
import type { ApiResult, ShowToast } from './types';

type BindInviteCreateFlowOptions = {
  api: string;
  recaptchaSiteKey?: string;
  pageBase: string;
  invitePanel: HTMLElement;
  createPanel: HTMLElement;
  inputUrl: HTMLInputElement;
  inputAlias: HTMLInputElement;
  aliasToggle: HTMLButtonElement;
  createBtn: HTMLButtonElement;
  resultNode: HTMLElement;
  recaptchaWrap: HTMLElement;
  aliasController: AliasUIController;
  getIp: () => string;
  showToast: ShowToast;
};

export function bindInviteCreateFlow(options: BindInviteCreateFlowOptions): void {
  const {
    api,
    recaptchaSiteKey,
    pageBase,
    invitePanel,
    createPanel,
    inputUrl,
    inputAlias,
    aliasToggle,
    createBtn,
    resultNode,
    recaptchaWrap,
    aliasController,
    getIp,
    showToast
  } = options;

  let capabilityToken = '';
  let recaptchaToken = '';
  let captchaVerified = false;

  const updateCreateFormState = (): void => {
    const valid = inputUrl.value.trim().startsWith('http');
    aliasController.syncSubmitButton(createBtn, valid);
    // create 流程需要同時滿足 URL 合法與 captcha 通過。
    createBtn.disabled = !(valid && captchaVerified);
  };

  const resetCaptchaState = (): void => {
    captchaVerified = false;
    recaptchaToken = '';
    updateCreateFormState();
  };

  const setupRecaptcha = (): void => {
    if (!recaptchaSiteKey) {
      showToast('Missing reCAPTCHA site key.', 'error');
      return;
    }

    recaptchaWrap.classList.remove('hidden');
    recaptchaWrap.innerHTML = `<div class="g-recaptcha" data-sitekey="${recaptchaSiteKey}" data-theme="dark" data-callback="verifyCallback"></div>`;

    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  };

  const enterCreateMode = (): void => {
    invitePanel.classList.add('hidden');
    createPanel.classList.remove('hidden');
    showToast('Authorized mode enabled.', 'success');
    setupRecaptcha();
    updateCreateFormState();
  };

  const hash = readDecodedHash();
  if (hash.startsWith('t=')) {
    capabilityToken = hash.slice(2);
    history.replaceState({}, '', '/invite');
    enterCreateMode();
  }

  inputUrl.addEventListener('input', () => {
    if (!inputUrl.value.trim().startsWith('http')) resetCaptchaState();
    updateCreateFormState();
  });

  aliasToggle.addEventListener('click', () => {
    aliasController.toggle();
    updateCreateFormState();
  });

  createBtn.addEventListener('click', async () => {
    if (!capabilityToken) {
      showToast(humanizeInviteError('capability_token_required'), 'error');
      return;
    }

    if (!captchaVerified || !recaptchaToken) {
      showToast('Please verify reCAPTCHA first.', 'error');
      return;
    }

    try {
      const data = await postForm<ApiResult>(api, {
        action: 'create',
        url: inputUrl.value,
        alias: aliasController.isOpen() ? inputAlias.value || undefined : undefined,
        capabilityToken,
        token: recaptchaToken,
        ip: getIp()
      });

      if (!data.success || !data.result) {
        showToast(humanizeInviteError(data.error, '建立短網址失敗，請稍後再試。'), 'error');
        return;
      }

      resultNode.textContent = `${pageBase}#${data.result}`;
      showToast('Create success.', 'success');
    } catch {
      showToast(humanizeInviteError('create_failed'), 'error');
    }
  });

  window.verifyCallback = (token: string) => {
    postForm<ApiResult>(api, { action: 'verify_captcha', token, ip: getIp() })
      .then((result) => {
        if (!result.success) {
          resetCaptchaState();
          const captchaError = (result['error-codes'] || [result.error || 'captcha_failed'])[0];
          showToast(humanizeInviteError(captchaError, 'reCAPTCHA 驗證失敗，請再試一次。'), 'error');
          return;
        }

        recaptchaToken = token;
        captchaVerified = true;
        updateCreateFormState();
        showToast('reCAPTCHA verified.', 'success');
      })
      .catch(() => {
        resetCaptchaState();
        showToast(humanizeInviteError('captcha_failed'), 'error');
      });
  };

  updateCreateFormState();
}
