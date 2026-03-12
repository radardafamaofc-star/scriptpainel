import { supabase } from "@/integrations/supabase/client";

interface CredentialSettings {
  charset: "numbers" | "letters" | "alphanumeric";
  length: number;
}

const CHARSETS = {
  numbers: "0123456789",
  letters: "abcdefghijklmnopqrstuvwxyz",
  alphanumeric: "abcdefghijklmnopqrstuvwxyz0123456789",
};

let cachedSettings: CredentialSettings | null = null;

export async function getCredentialSettings(): Promise<CredentialSettings> {
  if (cachedSettings) return cachedSettings;
  const { data } = await supabase
    .from("panel_settings")
    .select("value")
    .eq("key", "credential_generation")
    .single();
  const val = data?.value as CredentialSettings | null;
  cachedSettings = val && val.charset ? val : { charset: "alphanumeric", length: 8 };
  // Cache for 30s
  setTimeout(() => { cachedSettings = null; }, 30000);
  return cachedSettings!;
}

function randomFromCharset(chars: string, length: number): string {
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function generateUsername(): Promise<string> {
  const settings = await getCredentialSettings();
  const chars = CHARSETS[settings.charset] || CHARSETS.alphanumeric;
  const len = Math.max(6, settings.length);
  return randomFromCharset(chars, len);
}

export async function generatePassword(): Promise<string> {
  const settings = await getCredentialSettings();
  const chars = CHARSETS[settings.charset] || CHARSETS.alphanumeric;
  const len = Math.max(6, settings.length);
  return randomFromCharset(chars, len);
}
