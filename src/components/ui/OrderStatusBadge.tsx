import clsx from 'clsx';
import { ORDER_STATUS_META, TONE_CLASSES, type OrderStatusValue } from '@/components/order-status';

export function OrderStatusBadge({ status }: { status: OrderStatusValue }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        TONE_CLASSES[meta.tone]
      )}
    >
      <span aria-hidden>{meta.symbol}</span>
      {meta.label}
    </span>
  );
}
