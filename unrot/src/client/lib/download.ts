// Save text as a file. The standalone demo build swaps this module for a stub
// (src/client/demo/download.ts), because sandboxed pages cannot download.

export function downloadText(filename: string, text: string, type = 'text/csv'): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
