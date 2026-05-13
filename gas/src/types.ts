/**
 * Shared primitive/domain types used across controller, services and repository.
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

type InviteRecord = {
  row: number;
  status: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
};

class InvalidJsonError extends Error {
  constructor() {
    super('invalid_json');
  }
}
