const UNSAFE_RESPONSE_HEADERS = /* @__PURE__ */ new Set([
  "content-length",
  "vary",
  "content-encoding",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export const safeHeaders = (headers) => {
  const accumulateIfSafe = (accumulator, [key, value]) => {
    if (UNSAFE_RESPONSE_HEADERS.has(key)) return accumulator;
    accumulator[key] = value;
    return accumulator;
  };
  return Object.entries(headers).reduce(accumulateIfSafe, {});
};

export const shouldPersonalize = (request) => {
  // Parse URL manually since URL constructor might not be available
  const urlString = request.url;
  const queryString = urlString.split('?')[1] || '';
  
  // Manual URLSearchParams implementation for Akamai EdgeWorkers
  const params = {};
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
      }
    });
  }
  
  const shouldRun = params["edge-pers"] !== undefined ||
    params["target"] === "on" ||
    params["hybrid-pers"] === "on" ||
    params["hybrid_test"] === "true" ||
    params["perf_test"] === "true";
  
  // Return both the decision and the promo parameter
  return {
    shouldRun,
    promo: params["promo"] !== undefined ? params["promo"] : null
  };
};

export const determineLocale = (request, url) => {
  const acceptLanguage = request.getHeaders()["Accept-Language"] || "";
  const defaultLocale = { ietf: "en-US", language: "en", country: "US", prefix: "" };

  // Parse pathname manually from URL string
  const urlString = typeof url === 'string' ? url : url.href || url.toString();
  const pathname = urlString.split('?')[0].split('#')[0];
  const pathParts = pathname.split("/").filter(Boolean);
  
  if (pathParts.length > 0) {
    const possibleLocale = pathParts[0].toLowerCase();
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(possibleLocale)) {
      const [language, country] = possibleLocale.split("-");
      return {
        ietf: possibleLocale,
        language,
        country: country ? country.toUpperCase() : undefined,
        prefix: `/${language}${country ? `-${country}` : ""}`,
      };
    }
  }

  if (acceptLanguage) {
    const preferredLocale = acceptLanguage.split(",")[0].trim();
    if (preferredLocale.includes("-")) {
      const [language, country] = preferredLocale.split("-");
      return {
        ietf: preferredLocale,
        language,
        country: country.toUpperCase(),
        prefix: `/${language}-${country.toLowerCase()}`,
      };
    }
  }

  return defaultLocale;
};

function setCookie(domain: string, key: string, value: string, options: { expires?: Date | number } = {}) {
  let expiresString = '';
  
  if (options.expires) {
    if (typeof options.expires === 'number') {
      // If expires is a number, treat it as days
      const date = new Date();
      date.setTime(date.getTime() + options.expires * 24 * 60 * 60 * 1000);
      expiresString = `expires=${date.toUTCString()}`;
    } else {
      // If expires is a Date object
      expiresString = `expires=${options.expires.toUTCString()}`;
    }
  } else {
    // Default to 730 days if no expires provided
    const date = new Date();
    date.setTime(date.getTime() + 730 * 24 * 60 * 60 * 1000);
    expiresString = `expires=${date.toUTCString()}`;
  }

  const cookie = `${key}=${value}; ${expiresString}; path=/ ; domain=.${domain};`;
  return cookie;
}

export const getVisitorStatus = ({
  request,
  expiryDays = 30,
  cookieName = 's_nr',
  domain,
}) => {
  const currentTime = Date.now();

  const cookieHeader = request.getHeaders()["Cookie"] || "";
  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.trim().split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join("=").trim();
      cookies[key] = value;
    }
  });

  const cookieValue = cookies[cookieName];
  let visitorStatus;
  let cookie;

  const cookieAttributes: { expires: Date; domain?: string } = { 
    expires: new Date(currentTime + expiryDays * 24 * 60 * 60 * 1000) 
  };

  if (domain) {
    cookieAttributes.domain = domain;
  }

  if (!cookieValue) {
    cookie = setCookie(domain, cookieName, `${currentTime}-New`, cookieAttributes);
    visitorStatus = 'New';
  } else {
    const [storedTime, storedState] = cookieValue.split('-').map((value) => value.trim());
    const storedTimeNum = parseInt(storedTime, 10);

    if (currentTime - storedTimeNum < 30 * 60 * 1000 && storedState === 'New') {
      cookie = setCookie(domain, cookieName, `${currentTime}-New`, cookieAttributes);
      visitorStatus = 'New';
    } else {
      cookie = setCookie(domain, cookieName, `${currentTime}-Repeat`, cookieAttributes);
      visitorStatus = 'Repeat';
    }
  }

  return {
    visitorStatus,
    cookie,
  };
};
