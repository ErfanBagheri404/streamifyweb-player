import { fetch as undiciFetch, ProxyAgent, type RequestInit } from "undici";

const PROXY_URL = "http://127.0.0.1:8085";
export const proxyAgent = new ProxyAgent(PROXY_URL);

export const fetchWithProxy = (url: string | URL, options?: RequestInit) => {
  return undiciFetch(url, { ...options, dispatcher: proxyAgent });
};

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";