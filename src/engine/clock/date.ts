// プロレプティック・グレゴリオ暦の日付変換（Hinnant算法）。
// 実環境の時刻・Dateオブジェクトは一切使用しない（決定論、simulation-clock仕様）。

export interface CivilDate {
  y: number;
  m: number;
  d: number;
}

export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const mm = m <= 2 ? m + 12 : m;
  const doy = Math.floor((153 * mm - 457) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): CivilDate {
  let n = z + 719468;
  const era = Math.floor((n >= 0 ? n : n - 146096) / 146097);
  const doe = n - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  n = m <= 2 ? y + 1 : y;
  return { y: n, m, d };
}

export function formatDate(z: number): string {
  const { y, m, d } = civilFromDays(z);
  const mm = m < 10 ? '0' + m : String(m);
  const dd = d < 10 ? '0' + d : String(d);
  return y + '-' + mm + '-' + dd;
}
