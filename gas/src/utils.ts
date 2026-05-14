/** 提供多層可重用的無狀態工具函式。 */
class InputNormalizer {
  static text(value: unknown): string {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    if (text === 'undefined' || text === 'null') return '';
    return text;
  }

  static alias(value: unknown): string {
    return InputNormalizer.text(value).toLowerCase();
  }

  static status(value: unknown): string {
    return InputNormalizer.text(value).toLowerCase();
  }
}

class DateUtil {
  static now(): Date {
    return new Date();
  }

  static nowIso(): string {
    return DateUtil.now().toISOString();
  }

  static parseIso(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  static isExpired(iso: string, now: Date): boolean {
    const parsed = DateUtil.parseIso(iso);
    if (!parsed) return false;
    return parsed.getTime() <= now.getTime();
  }

  static nextUtcDayIso(now: Date): string {
    // 配額以 UTC 隔日重置，確保跨時區行為一致。
    const next = new Date(now.getTime());
    next.setUTCHours(0, 0, 0, 0);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }
}

class DigestUtil {
  static sha256Hex(value: string): string {
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      value,
      Utilities.Charset.UTF_8
    );
    return bytes
      .map((byte) => {
        const normalized = byte < 0 ? byte + 256 : byte;
        const hex = normalized.toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
      })
      .join('');
  }

  static timingSafeEqual(a: string, b: string): boolean {
    // 固定時間比較可降低字串比較的時序側通道風險。
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return mismatch === 0;
  }
}

class RandomUtil {
  private static readonly ALPHA_NUM =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  private static readonly LOWER_ALPHA_NUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

  static randomString(length: number, charset: string): string {
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return out;
  }

  static randomAlias(length: number): string {
    return RandomUtil.randomString(length, RandomUtil.ALPHA_NUM);
  }

  static randomClientCode(length: number): string {
    return `c_${RandomUtil.randomString(length, RandomUtil.LOWER_ALPHA_NUM)}`;
  }

  static randomToken(length: number): string {
    // UUID 去除連字號後串接，確保能產生足夠長度的高熵 token。
    let token = '';
    while (token.length < length) {
      token += Utilities.getUuid().replace(/-/g, '');
    }
    return token.slice(0, length);
  }
}
