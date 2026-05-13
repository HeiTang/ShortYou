import { createAliasUIController } from './alias-ui';
import { fetchIPFromCloudflare, getById, setCurrentYear } from './common';
import { bindInviteCreateFlow } from './invite/create-flow';
import { bindInviteExchange } from './invite/exchange-flow';
import type { InvitePageConfig, ShowToast, ToastType } from './invite/types';

export function initInvitePage(config: InvitePageConfig): void {
  if (!config || !config.api) return;

  const pageBase = `${window.location.origin}/`;
  setCurrentYear();

  const invitePanel = getById<HTMLElement>('invitePanel');
  const createPanel = getById<HTMLElement>('createPanel');
  const inviteCodeInput = getById<HTMLInputElement>('inviteCode');
  const inviteCodeError = getById<HTMLElement>('inviteCodeError');
  const exchangeBtn = getById<HTMLButtonElement>('exchangeBtn');
  const exchangeResult = getById<HTMLElement>('exchangeResult');
  const inputUrl = getById<HTMLInputElement>('url');
  const inputAlias = getById<HTMLInputElement>('alias');
  const aliasToggle = getById<HTMLButtonElement>('aliasToggle');
  const aliasPanel = getById<HTMLElement>('aliasPanel');
  const aliasWrap = getById<HTMLElement>('aliasWrap');
  const recaptchaWrap = getById<HTMLElement>('recaptcha');
  const createBtn = getById<HTMLButtonElement>('createBtn');
  const resultNode = getById<HTMLElement>('result');
  const toast = getById<HTMLElement>('toast');

  if (
    !invitePanel ||
    !createPanel ||
    !inviteCodeInput ||
    !inviteCodeError ||
    !exchangeBtn ||
    !exchangeResult ||
    !inputUrl ||
    !inputAlias ||
    !aliasToggle ||
    !aliasPanel ||
    !aliasWrap ||
    !recaptchaWrap ||
    !createBtn ||
    !resultNode ||
    !toast
  ) {
    return;
  }

  let ip = '';
  let toastTimer = 0;

  const showToast: ShowToast = (
    text: string,
    type: ToastType = 'warn'
  ): void => {
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

  const aliasController = createAliasUIController({
    inputAlias,
    aliasToggle,
    aliasPanel,
    aliasWrap
  });

  bindInviteExchange({
    api: config.api,
    inviteCodeInput,
    inviteCodeError,
    exchangeBtn,
    exchangeResult,
    getIp: () => ip,
    showToast
  });

  bindInviteCreateFlow({
    api: config.api,
    recaptchaSiteKey: config.recaptchaSiteKey,
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
    getIp: () => ip,
    showToast
  });

  // 非阻塞取得 IP，供後續 API 請求帶入風險評估。
  void fetchIPFromCloudflare().then((detectedIP) => {
    ip = detectedIP;
  });
}
