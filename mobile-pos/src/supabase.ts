import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.warn("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY before starting the Android app.");
}

const secureStorage = {
  getItem: (keyName: string) => SecureStore.getItemAsync(keyName),
  setItem: (keyName: string, value: string) => SecureStore.setItemAsync(keyName, value),
  removeItem: (keyName: string) => SecureStore.deleteItemAsync(keyName),
};

export const supabase = createClient(url || "https://invalid.local", key || "missing-publishable-key", {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
