import Constants from 'expo-constants';

const RAW_GITHUB_DEFAULT =
  'https://raw.githubusercontent.com/EllowDigital/DhanDiary/dev/shareapp-link.txt';

function toRawGitHubUrl(url: string) {
  // convert blob urls to raw URLs
  try {
    const u = new URL(url);
    if (u.hostname === 'github.com' && u.pathname.includes('/blob/')) {
      return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }
    return url;
  } catch (e) {
    return url;
  }
}

export async function getLatestShareLink(): Promise<string> {
  // priority: env var -> app config extra -> default raw github
  const extra: any = (Constants as any)?.expoConfig?.extra || {};
  const fromEnv = process.env.SHARELINK_URL || extra.SHARELINK_URL || extra.REMOTE_SHARE_LINK;

  const candidate = fromEnv ? toRawGitHubUrl(fromEnv) : RAW_GITHUB_DEFAULT;

  try {
    const res = await fetch(candidate, { method: 'GET' });
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) throw new Error('empty');
    return trimmed;
  } catch (err) {
    // fallback to default raw file if candidate failed and it's not already default
    if (candidate !== RAW_GITHUB_DEFAULT) {
      try {
        const res2 = await fetch(RAW_GITHUB_DEFAULT, { method: 'GET' });
        if (res2.ok) {
          const t2 = (await res2.text()).trim();
          if (t2) return t2;
        }
      } catch (e) {
        // ignore
      }
    }
    // as last resort return candidate (may be a direct link)
    return candidate;
  }
}

export default getLatestShareLink;
