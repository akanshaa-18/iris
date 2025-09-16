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
  // Use safe EdgeWorker fields instead of request.url
  const query = request.query || '';
  
  // Manual URLSearchParams implementation for Akamai EdgeWorkers
  const params = {};
  if (query) {
    query.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
      }
    });
  }
  
  return params["edge-pers"] !== undefined ||
    params["target"] === "on" ||
    params["hybrid-pers"] === "on" ||
    params["hybrid_test"] === "true" ||
    params["perf_test"] === "true";
};

export const determineLocale = (request, url) => {
  const acceptLanguage = request.getHeaders()["Accept-Language"] || "";
  const defaultLocale = { ietf: "en-US", language: "en", country: "US", prefix: "", region: "us" };

  // Parse pathname from URL or request
  let pathname = "";
  if (url) {
    if (typeof url === 'string') {
      pathname = url.split('?')[0].split('#')[0];
    } else if (url.pathname) {
      pathname = url.pathname;
    } else if (url.href) {
      pathname = url.href.split('?')[0].split('#')[0];
    }
  } else if (request.path) {
    pathname = request.path;
  }
  
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
        region: country ? country.toLowerCase() : language
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
        region: country.toLowerCase()
      };
    }
  }

  return defaultLocale;
};

function setCookie(domain, key, value, options = {}) {
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
  const cookies = {};

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

  const cookieAttributes = { 
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
