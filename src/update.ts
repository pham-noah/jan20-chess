/**
 * The updater: ask GitHub for the newest release, then (on the phone) hand the APK to Android to install.
 *
 * <p>Kept out of main.ts because it is the only part of the app that talks to the network, and because the two
 * halves have nothing to do with chess: `check` is pure enough to read, `install` is a thin wrapper over the
 * ApkInstaller plugin. The browser and the PWA never call `install` — there is no installer to open there.
 */
import { registerPlugin } from '@capacitor/core';

const REPO = 'pham-noah/jan20-chess';

export interface Release {
  version: string;
  url: string;
  name: string;
  size: number;
  page: string;
}

export type Check = { kind: 'current' } | { kind: 'found'; release: Release } | { kind: 'failed' };

/** 1.10.0 beats 1.9.2: the parts are numbers, not strings, and a leading v is part of the tag, not the version. */
export function newer(candidate: string, current: string): boolean {
  const num = (s: string) => s.replace(/^v/i, '').split(/[.+-]/).map(p => parseInt(p, 10));
  const a = num(candidate), b = num(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = Number.isFinite(a[i]) ? a[i] : 0, y = Number.isFinite(b[i]) ? b[i] : 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** arm64 first, because that is every phone this was written for; any other APK is better than none. */
function pickApk(assets: any[]): any | undefined {
  const apks = (assets || []).filter((a: any) => a && /\.apk$/i.test(a.name || '') && a.browser_download_url);
  return apks.find((a: any) => /arm64/i.test(a.name)) || apks[0];
}

export async function checkForUpdate(current: string): Promise<Check> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    // nothing published yet is not a failure: it is the answer "you already have it"
    if (r.status === 404) return { kind: 'current' };
    if (!r.ok) return { kind: 'failed' };
    const j: any = await r.json();
    const tag = String(j.tag_name || '').replace(/^v/i, '');
    if (!tag || !newer(tag, current)) return { kind: 'current' };
    const apk = pickApk(j.assets);
    if (!apk) return { kind: 'current' };
    return {
      kind: 'found',
      release: {
        version: tag,
        url: apk.browser_download_url,
        name: apk.name,
        size: apk.size || 0,
        page: j.html_url || `https://github.com/${REPO}/releases/latest`,
      },
    };
  } catch {
    return { kind: 'failed' };
  }
}

interface ApkInstallerPlugin {
  download(o: { url: string; name: string; size: number }): Promise<{ path: string; bytes: number }>;
  install(o: { path: string }): Promise<void>;
  status(): Promise<{ allowed: boolean }>;
  openSettings(): Promise<void>;
  addListener(
    event: 'progress',
    cb: (p: { received: number; total: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

export type Outcome =
  | { kind: 'installing' }
  /** the file is on the phone, and Android wants the one-time "install unknown apps" toggle first */
  | { kind: 'needs-permission' }
  | { kind: 'failed'; why: string };

export async function installUpdate(release: Release, onProgress?: (fraction: number) => void): Promise<Outcome> {
  let handle: { remove: () => Promise<void> } | undefined;
  try {
    const { allowed } = await ApkInstaller.status();
    if (onProgress) {
      handle = await ApkInstaller.addListener('progress', p =>
        onProgress(p.total > 0 ? Math.min(1, p.received / p.total) : 0),
      );
    }
    const { path } = await ApkInstaller.download({ url: release.url, name: release.name, size: release.size });
    if (!allowed) {
      await ApkInstaller.openSettings();
      return { kind: 'needs-permission' };
    }
    await ApkInstaller.install({ path });
    return { kind: 'installing' };
  } catch (e) {
    return { kind: 'failed', why: e instanceof Error ? e.message : String(e) };
  } finally {
    if (handle) await handle.remove().catch(() => {});
  }
}
