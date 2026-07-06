import { insforge } from "./insforge";

export async function rateLimit(key: string, limit = 5, windowSeconds = 60) {
  return insforge.rpc<boolean>("hit_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
}
