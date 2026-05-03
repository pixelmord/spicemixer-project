export interface ImageResult {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  creator: string;
  creatorUrl: string;
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  width?: number;
  height?: number;
}

export interface SearchImagesOptions {
  page?: number;
  pageSize?: number;
  licenseType?: "commercial" | "modification" | "commercial,modification";
}

const OPENVERSE_BASE = "https://api.openverse.org/v1/images/";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function fetchOAuthToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  try {
    const response = await fetch("https://api.openverse.org/v1/auth_tokens/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export async function searchImages(
  query: string,
  opts: SearchImagesOptions = {},
): Promise<{ results: ImageResult[]; count: number; page: number }> {
  const { page = 1, pageSize = 20, licenseType } = opts;

  const params = new URLSearchParams({
    q: query,
    page_size: String(pageSize),
    page: String(page),
  });
  if (licenseType) params.set("license_type", licenseType);

  const headers: Record<string, string> = {
    "User-Agent": "SpiceMixer/1.0",
  };

  const clientId = process.env["OPENVERSE_CLIENT_ID"];
  const clientSecret = process.env["OPENVERSE_CLIENT_SECRET"];
  if (clientId && clientSecret) {
    const token = await fetchOAuthToken(clientId, clientSecret);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${OPENVERSE_BASE}?${params.toString()}`, { headers });
  if (!response.ok) {
    throw new Error(`Openverse API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    count: number;
    results: Array<{
      id: string;
      url: string;
      thumbnail: string;
      title?: string;
      creator?: string;
      creator_url?: string;
      source?: string;
      foreign_landing_url?: string;
      license?: string;
      license_url?: string;
      attribution?: string;
      width?: number;
      height?: number;
    }>;
  };

  return {
    count: data.count,
    page,
    results: data.results.map((r) => ({
      id: r.id,
      url: r.url,
      thumbnail: r.thumbnail,
      title: r.title ?? "Untitled",
      creator: r.creator ?? "",
      creatorUrl: r.creator_url ?? "",
      source: r.source ?? "",
      sourceUrl: r.foreign_landing_url ?? "",
      license: r.license ?? "",
      licenseUrl: r.license_url ?? "",
      attribution: r.attribution ?? "",
      width: r.width,
      height: r.height,
    })),
  };
}
