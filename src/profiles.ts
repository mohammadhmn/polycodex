import fs from "node:fs/promises";
import { loadConfig, normalizeAccountName, isValidAccountName, saveConfig } from "./config";
import { accountDir } from "./paths";
import type { PolyConfigV2 } from "./types";

export async function addAccount({
  name,
}: {
  name: string;
}): Promise<{ config: PolyConfigV2; account: string }> {
  const account = normalizeAccountName(name);
  if (!isValidAccountName(account)) {
    throw new Error("Invalid account name. Use letters, numbers, underscore, or dash.");
  }

  const config = await loadConfig();
  if (account in config.accounts) {
    throw new Error(`Account already exists: ${account}`);
  }

  await fs.mkdir(accountDir(account), { recursive: true, mode: 0o700 });
  config.accounts[account] = {};
  if (!config.currentAccount) config.currentAccount = account;

  await saveConfig(config);

  return { config, account };
}

export async function listAccounts(): Promise<{
  config: PolyConfigV2;
  accounts: { name: string; isCurrent: boolean }[];
}> {
  const config = await loadConfig();
  const names = Object.keys(config.accounts).sort();
  return {
    config,
    accounts: names.map((name) => ({ name, isCurrent: name === config.currentAccount })),
  };
}

export async function useAccount(name: string): Promise<PolyConfigV2> {
  const account = normalizeAccountName(name);
  const config = await loadConfig();
  if (!(account in config.accounts)) {
    throw new Error(`Unknown account: ${account}`);
  }
  config.currentAccount = account;
  await saveConfig(config);
  return config;
}

export async function currentAccount(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.currentAccount;
}

export async function removeAccount({
  name,
  deleteData,
}: {
  name: string;
  deleteData: boolean;
}): Promise<PolyConfigV2> {
  const account = normalizeAccountName(name);
  const config = await loadConfig();
  if (!(account in config.accounts)) throw new Error(`Unknown account: ${account}`);

  delete config.accounts[account];

  if (config.currentAccount === account) {
    const next = Object.keys(config.accounts).sort()[0];
    config.currentAccount = next || undefined;
  }

  await saveConfig(config);

  if (deleteData) {
    await fs.rm(accountDir(account), { recursive: true, force: true });
  }

  return config;
}
