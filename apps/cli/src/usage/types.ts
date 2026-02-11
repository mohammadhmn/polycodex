export type JsonRecord = Record<string, unknown>;

export type FetchLike = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;

export type CodexTokens = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  account_id?: string;
};

export type CodexAuthPayload = {
  OPENAI_API_KEY?: string | null;
  tokens?: CodexTokens;
  last_refresh?: string;
} & JsonRecord;

export type AuthSource =
  | { kind: "file"; path: string }
  | { kind: "keychain" };

export type LoadedAuth = {
  auth: CodexAuthPayload;
  source: AuthSource;
};

export type UsageApiResponseData = {
  rate_limit?: {
    primary_window?: JsonRecord;
    secondary_window?: JsonRecord;
  };
  code_review_rate_limit?: {
    primary_window?: JsonRecord;
  };
  credits?: JsonRecord;
};
