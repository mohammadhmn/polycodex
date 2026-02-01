export type PolyConfigV2 = {
  version: 2;
  currentAccount?: string;
  accounts: Record<
    string,
    {
      // Reserved for future use (keep objects extensible).
    }
  >;
};

export type PolyConfigAny = PolyConfigV2 | PolyConfigV1Legacy;

// Legacy v1 (from earlier iterations)
export type PolyConfigV1Legacy = {
  version: 1;
  sharedState: boolean;
  currentAccount?: string;
  accounts: Record<
    string,
    {
      codexHome: string;
    }
  >;
};
