const USER_AGENT = "Mozilla/5.0 (compatible; StartstrekenBot/1.0; +https://startstreken.no)";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
  }
}

type Opts = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch() with a timeout, retries on network errors / 429 / 5xx, and a consistent UA. */
export async function fetchText(url: string, opts: Opts = {}): Promise<string> {
  const { timeoutMs = 45_000, retries = 2 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(800 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...opts.headers },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (res.ok) return text;

      const err = new HttpError(`${res.status} ${res.statusText} for ${url}`, res.status, text.slice(0, 300));
      if (res.status !== 429 && res.status < 500) throw err;
      lastErr = err;
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T = unknown>(url: string, opts: Opts = {}): Promise<T> {
  const text = await fetchText(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
  }
}

/** Runs fn over items with at most `limit` in flight — keeps us polite to the sources. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
