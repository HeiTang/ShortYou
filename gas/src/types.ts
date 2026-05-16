/**
 * 後端共用型別：供 controller / services / repository 共同使用。
 */
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type ApiResult = {
  success: boolean;
  result: string;
  error?: string;
  skipped?: boolean;
  'error-codes'?: string[];
  [key: string]: JsonValue | undefined;
};

type ShortLinkRecord = {
  row: number;
  alias: string;
  url: string;
  status: string;
};

type ClientRecord = {
  row: number;
  clientCode: string;
  ownerName: string;
  status: string;
  capabilityTokenHash: string;
  expiresAt: string;
  dailyQuota: number;
  dailyUsed: number;
  quotaResetAt: string;
};

class InvalidJsonError extends Error {
  constructor() {
    // 使用明確錯誤型別，讓 controller 可以回傳固定錯誤碼。
    super('invalid_json');
  }
}
