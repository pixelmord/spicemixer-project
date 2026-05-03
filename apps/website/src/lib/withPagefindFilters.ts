export type PagefindFilterMap = Record<string, string>;

export type PagefindRecord = {
  kind?: string | null;
  region?: string[] | string | null;
  category?: string | null;
  flavorProfile?: string[] | string | null;
  cuisine?: string | null;
};

/** Build the Pagefind filter map from a content record. Missing fields are omitted. */
export function withPagefindFilters(record: PagefindRecord): PagefindFilterMap {
  const out: PagefindFilterMap = {};

  if (record.kind) out.kind = record.kind;

  if (record.region) {
    const v = Array.isArray(record.region)
      ? record.region.filter(Boolean).join(",")
      : record.region;
    if (v) out.region = v;
  }

  if (record.category) out.category = record.category;

  if (record.flavorProfile) {
    const v = Array.isArray(record.flavorProfile)
      ? record.flavorProfile.filter(Boolean).join(",")
      : record.flavorProfile;
    if (v) out.flavorProfile = v;
  }

  if (record.cuisine) out.cuisine = record.cuisine;

  return out;
}
