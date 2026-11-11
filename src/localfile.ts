/** A real file on disk that the app keeps current, so nothing has to be exported by hand.
 *
 *  Desktop (Tauri): one JSON file in the app config folder, written by a Rust command on every save.
 *  Browser: the File System Access API, with the file handle remembered between sessions — pick the file once
 *  and every later edit lands in it.
 */
type Ctx = { kvGet: (k: string) => Promise<any>; kvSet: (k: string, v: any) => Promise<void> };
export type FileState = { kind: 'tauri' | 'browser' | 'none'; path?: string; note?: string; when?: string };

const HANDLE_KEY = 'file-handle';
const tauri = () => (window as any).__TAURI__;
const canPick = () => typeof (window as any).showSaveFilePicker === 'function';

let handle: any;
let state: FileState = { kind: 'none' };
let pending: any;

export const fileState = () => state;
export const filePicking = canPick;
export const fileNative = () => !!tauri();

/** Called once at start-up. Returns the path (desktop) or file name (browser) when one is already linked. */
export async function initFile(ctx: Ctx): Promise<FileState> {
  if (tauri()) {
    state = { kind: 'tauri' };
    try { state.path = await tauri().core.invoke('local_path_hint'); } catch { state.path = 'the app config folder'; }
    return state;
  }
  if (canPick()) {
    const saved = await ctx.kvGet(HANDLE_KEY);
    if (saved?.name) {
      const perm = await saved.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt');
      handle = perm === 'granted' ? saved : undefined;
      state = { kind: 'browser', path: saved.name, note: perm === 'granted' ? undefined : 'permission needed — reopen it' };
    } else state = { kind: 'browser' };
    return state;
  }
  state = { kind: 'none' };
  return state;
}

/** Read whatever is in the file already (desktop only: the browser file is loaded by the user). */
export async function readFile(): Promise<any | undefined> {
  if (!tauri()) return undefined;
  let text: string | undefined;
  try { text = await tauri().core.invoke('load_local'); } catch { return undefined; }
  if (!text) return undefined;
  try { return JSON.parse(text); } catch {
    // The file is not valid JSON. Keep it: move it aside, then let a fresh file be written from what we have.
    try {
      const aside = await tauri().core.invoke('backup_local');
      state.note = aside ? `the file could not be read and was moved to ${aside}` : 'the file could not be read';
    } catch { state.note = 'the file could not be read'; }
    return undefined;
  }
}

/** Ask the user for a file and start writing to it (browser). */
export async function linkFile(ctx: Ctx, suggested = 'jan20-repertoire.json'): Promise<FileState> {
  if (!canPick()) return state;
  const h = await (window as any).showSaveFilePicker({
    suggestedName: suggested,
    types: [{ description: 'Jan20 repertoire', accept: { 'application/json': ['.json'] } }],
  });
  handle = h;
  await ctx.kvSet(HANDLE_KEY, h);
  state = { kind: 'browser', path: h.name };
  if (pending) void writeNow(pending);
  return state;
}

export async function unlinkFile(ctx: Ctx): Promise<FileState> {
  handle = undefined;
  await ctx.kvSet(HANDLE_KEY, undefined);
  state = { kind: canPick() ? 'browser' : 'none' };
  return state;
}

/** Write now, or as soon as a file is linked. Never throws: a failed write must not break editing. */
export async function writeNow(text: string): Promise<boolean> {
  pending = text;
  if (state.kind === 'tauri') {
    try {
      state.path = await tauri().core.invoke('save_local', { json: text });
      state.when = new Date().toLocaleTimeString();
      state.note = undefined;
      pending = undefined;
      return true;
    } catch (e: any) { state.note = 'could not write the file'; return false; }
  }
  if (!handle) return false;
  try {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
    state.when = new Date().toLocaleTimeString();
    state.note = undefined;
    pending = undefined;
    return true;
  } catch { state.note = 'could not write the file'; return false; }
}

/** Debounced write: editing a repertoire should not hammer the disk on every keystroke. */
let t: any;
export function writeSoon(text: string, ms = 600) { clearTimeout(t); t = setTimeout(() => void writeNow(text), ms); }
