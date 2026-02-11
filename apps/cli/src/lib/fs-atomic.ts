import fs from "node:fs/promises";
import path from "node:path";

export async function safeReadFileBytes(filePath: string): Promise<Uint8Array | undefined> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

export async function safeReadFileUtf8(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return;
    throw error;
  }
}

export async function writeFileAtomicBytes(filePath: string, data: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tmpPath, data, { mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}

export async function writeFileAtomicText(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tmpPath, text, { mode: 0o600, encoding: "utf8" });
  await fs.rename(tmpPath, filePath);
}
