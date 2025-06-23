import { Headers } from "create-response";

const UNSAFE_RESPONSE_HEADERS = new Set([
  'content-length', 'vary', 'content-encoding', 
  'connection', 'keep-alive', 'proxy-authenticate',
  'trailer', 'transfer-encoding',  'upgrade'
]);

type HeaderEntry = [string, string | string[]]

export const safeHeaders = (headers: Headers): Headers => {
  const accumulateIfSafe = (
    accumulator: Headers,
    [key, value]: HeaderEntry
  ): Headers => {
    if (UNSAFE_RESPONSE_HEADERS.has(key)) return accumulator;
    accumulator[key] = value;
    return accumulator;
  };
  return Object.entries(headers).reduce(accumulateIfSafe, {});
};

type Cookie = {
  name: string;
  value: string;
  domain?: string;
  expires?: Date | 0;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
};

export const setCookie = (
  headers: Headers,
  cookie: Cookie
): Headers => {
  throw new Error('unimplemented');
};

export const getCookie = (
  headers: Headers
) => (name: string): string => {
  throw new Error('unimplemented');
}
