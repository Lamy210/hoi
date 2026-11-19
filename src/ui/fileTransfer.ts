// セーブファイルのエクスポート/インポート（.orbis = msgpackバイナリ）
import { SAVE_SCHEMA_VERSION } from '../engine/save/serialize';

export const SAVE_FILE_EXT = '.orbis';

export function exportSaveFile(buf: Uint8Array, dateStr: string): void {
  const blob = new Blob([buf.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'orbis_' + dateStr + SAVE_FILE_EXT;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importSaveFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (!file.name.endsWith(SAVE_FILE_EXT)) {
      reject(new Error('not a .orbis file'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function schemaVersion(): number {
  return SAVE_SCHEMA_VERSION;
}
