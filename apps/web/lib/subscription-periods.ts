import type { BillingInterval } from '@bienvu/contracts';

// Always use the original UTC day: Jan 31 -> Feb 28/29 -> Mar 31.
// Future grants are stored with validity bounds and never made spendable early.
export function subscriptionCreditPeriods(interval: BillingInterval, start: number, end: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start)
    throw Error('INVALID_SUBSCRIPTION_PERIOD');
  const anchor = new Date(start * 1000);
  const boundary = (month: number) => {
    const y = anchor.getUTCFullYear(),
      m = anchor.getUTCMonth() + month;
    return (
      Date.UTC(
        y,
        m,
        Math.min(anchor.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate()),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
      ) / 1000
    );
  };
  if (interval === 'month') {
    if (end - start < 27 * 86400 || end - start > 32 * 86400) throw Error('INVALID_SUBSCRIPTION_PERIOD');
  } else if (boundary(12) !== end) throw Error('INVALID_SUBSCRIPTION_PERIOD');
  return Array.from({ length: interval === 'year' ? 12 : 1 }, (_, index) => ({
    start: new Date((index === 0 ? start : boundary(index)) * 1000).toISOString(),
    end: new Date((interval === 'month' || index === 11 ? end : boundary(index + 1)) * 1000).toISOString(),
  }));
}
