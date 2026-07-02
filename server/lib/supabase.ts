import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..", "..");

dotenv.config({ path: path.join(rootDir, ".env") });

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export function getSupabaseConfigHint() {
  if (!supabaseUrl) return "Missing SUPABASE_URL in .env";
  if (!serviceRoleKey) return "Missing SUPABASE_SERVICE_ROLE_KEY in .env";
  return "Supabase configured";
}

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
