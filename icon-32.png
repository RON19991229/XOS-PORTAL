/**
 * Small gender badge — ♂ blue / ♀ pink / nothing if null.
 * Used in TodayList, CustomerList, HistoryClient, and CustomerDetail.
 */
export default function GenderBadge({
  gender,
  size = 'sm',
}: {
  gender: 'male' | 'female' | null;
  size?: 'sm' | 'md';
}) {
  if (!gender) return null;

  const isMale = gender === 'male';
  const symbol = isMale ? '♂' : '♀';
  const color = isMale ? 'text-sky-500' : 'text-pink-500';
  const fontSize = size === 'md' ? 'text-base' : 'text-sm';

  return (
    <span
      className={`${color} ${fontSize} font-bold flex-shrink-0`}
      title={isMale ? 'Male' : 'Female'}
      aria-label={isMale ? 'Male' : 'Female'}
    >
      {symbol}
    </span>
  );
}
