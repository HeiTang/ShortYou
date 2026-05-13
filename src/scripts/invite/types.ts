export type InvitePageConfig = {
  api: string;
  recaptchaSiteKey?: string;
};

export type ApiResult = {
  success: boolean;
  result?: string;
  error?: string;
  'error-codes'?: string[];
};

export type ToastType = 'warn' | 'success' | 'error';
export type ShowToast = (text: string, type?: ToastType) => void;
