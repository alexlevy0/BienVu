-- Apportion integer reversals over twelve grants without rounding a tiny
-- refund up twelve times. The sum equals the original receipt's reversal;
-- each month's reversal grows monotonically as refunds increase.
DROP VIEW allocation_receipts;
CREATE VIEW allocation_receipts AS
 SELECT a.id allocation_id,f.id receipt_id,
 CASE WHEN annual.allocation_id IS NOT NULL THEN f.credits/12 WHEN promo.intent_id IS NOT NULL THEN a.quota_limit ELSE f.credits END base_credits,
 CASE WHEN annual.allocation_id IS NOT NULL THEN CAST(f.reversed_credits/12 AS INTEGER)+IIF(annual.ordinal<f.reversed_credits%12,1,0)
 WHEN promo.intent_id IS NOT NULL THEN min(a.quota_limit,CAST(((f.refunded_cents+f.lost_cents)*a.quota_limit+f.gross_cents-1)/f.gross_cents AS INTEGER))
 ELSE f.reversed_credits END reversed
 FROM allocations a LEFT JOIN annual_credit_periods annual ON annual.allocation_id=a.id
 LEFT JOIN credit_promotion_redemptions promo ON promo.allocation_id=a.id
 JOIN financial_receipts f ON f.allocation_id=a.id OR f.invoice_id=annual.invoice_id OR f.id=promo.receipt_id;
