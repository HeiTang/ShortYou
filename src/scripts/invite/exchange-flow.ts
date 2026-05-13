import { postForm } from '../common';
import { humanizeInviteError } from './messages';
import type { ApiResult, ShowToast } from './types';

type BindInviteExchangeOptions = {
  api: string;
  inviteCodeInput: HTMLInputElement;
  inviteCodeError: HTMLElement;
  exchangeBtn: HTMLButtonElement;
  exchangeResult: HTMLElement;
  getIp: () => string;
  showToast: ShowToast;
};

export function bindInviteExchange(options: BindInviteExchangeOptions): void {
  const {
    api,
    inviteCodeInput,
    inviteCodeError,
    exchangeBtn,
    exchangeResult,
    getIp,
    showToast
  } = options;

  const setInviteCodeError = (text = ''): void => {
    inviteCodeError.textContent = text;
    inviteCodeError.classList.toggle('hidden', !text);
    inviteCodeInput.classList.toggle('input-error', !!text);
  };

  const updateInviteExchangeState = (): void => {
    const hasCode = inviteCodeInput.value.trim().length > 0;
    exchangeBtn.classList.toggle('hidden', !hasCode);
    exchangeBtn.disabled = !hasCode;
  };

  exchangeBtn.addEventListener('click', async () => {
    const code = inviteCodeInput.value.trim();
    if (!code) {
      setInviteCodeError('請輸入 Invite Code。');
      return;
    }

    setInviteCodeError('');
    exchangeBtn.disabled = true;
    exchangeResult.textContent = '';

    try {
      const data = await postForm<ApiResult>(api, {
        action: 'exchange_invite',
        inviteCode: code,
        ip: getIp()
      });

      if (!data.success || !data.result) {
        setInviteCodeError(humanizeInviteError(data.error, 'Invite Code 兌換失敗，請稍後再試。'));
        return;
      }

      exchangeResult.textContent = data.result;
      showToast('Invite exchanged. Open returned link.', 'success');
    } catch {
      setInviteCodeError(humanizeInviteError('invite_exchange_failed'));
    } finally {
      updateInviteExchangeState();
    }
  });

  inviteCodeInput.addEventListener('input', () => {
    setInviteCodeError('');
    updateInviteExchangeState();
  });

  // 首次進頁先同步按鈕可用狀態。
  updateInviteExchangeState();
}
