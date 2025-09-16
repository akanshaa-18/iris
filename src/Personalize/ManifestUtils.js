import { logger } from "log";

// Simple URL parsing function for EdgeWorker environment
function parseURL(urlString) {
  try {
    // Simple regex-based URL parsing
    const urlRegex = /^(https?:\/\/[^\/]+)(\/[^#]*)?(#.*)?$/;
    const match = urlString.match(urlRegex);
    
    if (!match) return null;
    
    const [, , pathname = '', hash = ''] = match;
    const search = '';
    
    return {
      href: urlString,
      pathname: pathname || '/',
      hash,
      search
    };
  } catch {
    return null;
  }
}

// Constants for manifest types
const MANIFEST_KEYS = [
  'action',
  'selector',
  'pagefilter',
  'page filter',
  'page filter optional',
];

const PROMO_PARAM = 'promo';

// Extract metadata from HTML content
export function extractMetadata(htmlContent, key) {
  const metaRegex = new RegExp(`<meta[^>]*(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = htmlContent.match(metaRegex);
  return match ? match[1] : null;
}

// Get MEP value with normalization
export function getMepValue(val) {
  if (!val) return null;
  
  const valMap = { 
    on: true, 
    off: false, 
    postLCP: 'postlcp' 
  };
  
  const finalVal = val.toLowerCase().trim();
  return finalVal in valMap ? valMap[finalVal] : finalVal;
}

// Get metadata value
export function getMdValue(htmlContent, key) {
  const value = extractMetadata(htmlContent, key);
  return value ? getMepValue(value) : null;
}

// Get promo MEP enablement (similar to getPromoMepEnablement in utils.js)
export function getPromoMepEnablement(htmlContent) {
  const mds = [
    'apac_manifestnames',
    'emea_manifestnames',
    'americas_manifestnames',
    'jp_manifestnames',
    'manifestnames',
  ];
  
  const mdObject = {};
  
  mds.forEach((key) => {
    const val = getMdValue(htmlContent, key);
    if (val && typeof val === 'string') {
      mdObject[key] = val;
    }
  });
  
  return Object.keys(mdObject).length > 0 ? mdObject : null;
}

// Get MEP enablement (similar to getMepEnablement in utils.js)
export function getMepEnablement(
  htmlContent, 
  mdKey, 
  queryParams = {}, 
  paramKey
) {
  const paramValue = queryParams[paramKey || mdKey];
  if (paramValue) return getMepValue(paramValue);
  
  if (PROMO_PARAM === paramKey) {
    return getPromoMepEnablement(htmlContent);
  }
  
  return getMdValue(htmlContent, mdKey);
}

// Parse manifest URLs from string
export function parseManifestUrlAndAddSource(manifestString, source) {
  if (!manifestString) return [];
  
  return manifestString.toLowerCase()
    .split(/,|(\s+)|(\\n)/g)
    .filter((path) => path?.trim())
    .map((manifestPath) => ({ 
      manifestPath: manifestPath.trim(), 
      source: [source] 
    }));
}

// Combine MEP sources (similar to combineMepSources in personalization.js)
export async function combineMepSources(
  htmlContent,
  queryParams = {},
  locale
) {
  let persManifests = [];

  // Personalization manifests
  const persEnabled = getMepEnablement(htmlContent, 'personalization', queryParams);
  if (persEnabled && typeof persEnabled === 'string') {
    persManifests = parseManifestUrlAndAddSource(persEnabled, 'pzn');
  }

  // ROC Personalization manifests
  const rocPersEnabled = getMepEnablement(htmlContent, 'personalization-roc', queryParams);
  if (rocPersEnabled && typeof rocPersEnabled === 'string') {
    const rocPersManifest = parseManifestUrlAndAddSource(rocPersEnabled, 'pzn-roc');
    persManifests = persManifests.concat(rocPersManifest);
  }

  // Promo manifests
  const promoEnabled = getMepEnablement(htmlContent, 'manifestnames', queryParams, PROMO_PARAM);
  if (promoEnabled && typeof promoEnabled === 'object') {
    const promoManifests = await getPromoManifests(promoEnabled, queryParams, htmlContent, locale);
    // Filter out disabled manifests and convert to the expected format
    const enabledPromoManifests = promoManifests
      .filter(manifest => !manifest.disabled)
      .map(manifest => ({
        manifestPath: manifest.manifestPath,
        source: manifest.source
      }));
    persManifests = persManifests.concat(enabledPromoManifests);
  }

  // MEP parameter manifests
  const mepParam = queryParams.mep;
  if (mepParam && mepParam !== 'off') {
    const persManifestPaths = persManifests.map((manifest) => {
      const { manifestPath } = manifest;
      if (manifestPath?.startsWith('/')) return manifestPath;
      try {
        const url = new URL(manifestPath);
        return url.pathname;
      } catch (e) {
        return manifestPath;
      }
    });

    mepParam.split('---').forEach((manifestPair) => {
      const manifestPath = manifestPair.trim().toLowerCase().split('--')[0];
      if (!persManifestPaths.includes(manifestPath)) {
        persManifests.push({ manifestPath, source: ['mep param'] });
      }
    });
  }

  return persManifests;
}

// Regional constants for promo manifests
const APAC = ['au', 'cn', 'hk_en', 'hk_zh', 'id_en', 'id_id', 'in', 'in_hi', 'kr', 'my_en', 'my_ms', 'nz', 'ph_en', 'ph_fil', 'sg', 'th_en', 'th_th', 'tw', 'vn_en', 'vn_vi'];
const EMEA = ['ae_en', 'ae_ar', 'africa', 'at', 'be_en', 'be_fr', 'be_nl', 'bg', 'ch_de', 'ch_fr', 'ch_it', 'cis_en', 'cis_ru', 'cz', 'de', 'dk', 'ee', 'eg_ar', 'eg_en', 'es', 'fi', 'fr', 'gr_el', 'gr_en', 'hu', 'ie', 'il_en', 'il_he', 'iq', 'is', 'it', 'kw_ar', 'kw_en', 'lt', 'lu_de', 'lu_en', 'lu_fr', 'lv', 'mena_ar', 'mena_en', 'ng', 'nl', 'no', 'pl', 'pt', 'qa_ar', 'qa_en', 'ro', 'ru', 'sa_en', 'sa_ar', 'se', 'si', 'sk', 'tr', 'ua', 'uk', 'za'];
const AMERICAS = ['us', 'ar', 'br', 'ca', 'ca_fr', 'cl', 'co', 'cr', 'ec', 'gt', 'la', 'mx', 'pe', 'pr'];
const JP = ['jp'];
const REGIONS = { APAC, EMEA, AMERICAS, JP };

// GMT string to local date conversion
const GMTStringToLocalDate = (gmtString) => new Date(`${gmtString}+00:00`);

// Check if promo is disabled based on event and search params
export function isPromoDisabled(event, searchParams, locale) {
  if (!event) return false;
  
  const localeCode = locale?.prefix?.substring(1) || 'us';
  
  // Check locale restrictions
  if (event.locales && !event.locales.includes(localeCode)) return true;
  
  // Check date restrictions
  const currentDate = searchParams?.instant ? new Date(searchParams.instant) : new Date();
  if ((!event.start && event.end) || (!event.end && event.start)) return true;
  
  return Boolean(event.start && event.end && (currentDate < event.start || currentDate > event.end));
}

// Check if manifest is within locale
const isManifestWithinLocale = (locales, locale) => {
  if (!locales) return true;
  const localeCode = locale?.prefix?.substring(1) || 'us';
  return locales.split(';').map((locale) => locale.trim()).includes(localeCode);
};

// Get regional promo manifests
const getRegionalPromoManifests = (
  manifestNames,
  region,
  searchParams,
  htmlContent,
  locale
) => {
  const attachedManifests = manifestNames
    ? manifestNames.split(',').map((manifest) => manifest?.trim())
    : [];

  const schedule = extractMetadata(htmlContent, region ? `${region}_schedule` : 'schedule');
  if (!schedule) {
    return [];
  }
  
  return schedule.split(',')
    .map((manifest) => {
      const [name, start, end, manifestPath, locales, cdtStart, cdtEnd] = manifest.trim().split('|').map((s) => s.trim());
      
      if (attachedManifests.includes(name) && isManifestWithinLocale(locales, locale)) {
        const event = {
          name,
          start: GMTStringToLocalDate(start),
          end: GMTStringToLocalDate(end),
          cdtStart,
          cdtEnd,
        };
        
        const disabled = isPromoDisabled(event, searchParams, locale);
        
        // Return the same structure as original promo-utils.js
        return { manifestPath, disabled, event, source: ['promo'] };
      }
      return null;
    })
    .filter((manifest) => manifest != null);
};

// Main promo manifests function
export async function getPromoManifests(
  manifestNames, 
  queryParams,
  htmlContent,
  locale
) {
  // Extract region code exactly like promo-utils.js
  const localeCode = locale?.prefix?.substring(1) || 'us';
  const regionCode = Object.keys(REGIONS)
    .find((r) => REGIONS[r]?.includes(localeCode))?.toLowerCase() || null;
  
  // Get regional promo manifests
  const promoManifests = regionCode != null ? getRegionalPromoManifests(
    manifestNames[`${regionCode}_manifestnames`],
    regionCode,
    queryParams,
    htmlContent,
    locale
  ) : [];
  
  // Get global promo manifests
  const globalPromoManifests = getRegionalPromoManifests(
    manifestNames.manifestnames,
    null,
    queryParams,
    htmlContent,
    locale
  );
  return [...promoManifests, ...globalPromoManifests];
}

// Export environment detection function (from Personalize.ts)
export function getEnvironment(url) {
  return [
    "stage",
    "dev", 
    "test",
    "localhost",
    ".page",
    ".live"
  ].some(str => url.includes(str)) ? "stage" : "prod";
}

// Normalize path function (mirrors client-side personalization.js exactly)
export function normalizePath(path, localize = true, request) {
  if (!path) return path;
  // Handle DAM content paths
  if (path.includes('/content/dam/')) return path;
  // Handle paths that don't contain '/'
  if (!path.includes('/')) return path;
  // Handle federated content paths
  if (path.includes('/federal/')) {
    return getFederatedUrl(path, request);
  }
  // For server-side, we need to determine config values from request
  // This is the server-side equivalent of getConfig()
  const config = getServerConfig(request);
  // If path doesn't start with codeRoot, http, or /, add leading slash
  if (!path.startsWith(config.codeRoot) && !path.startsWith('http') && !path.startsWith('/')) {
    path = `/${path}`;
  }
  try {
    const url = parseURL(path);

    
    const { hash, pathname } = url;
    const firstFolder = pathname.split('/')[1];
    const mepHash = '#_dnt';
    
    // Check if path should be localized
    if (path.startsWith(config.codeRoot)
      || path.includes('.hlx.')
      || path.includes('.aem.')
      || path.includes('.adobe.')
      || path.includes('localhost:')) { 
      if (!localize
        || config.locale.ietf === 'en-US'
        || hash.includes(mepHash)
        || firstFolder in config.locales
        || path.includes('.json')) {
        path = pathname;
      } else {
        path = `${config.locale.prefix}${pathname}`;
      }
    }
    return `${path}${hash.replace(mepHash, '')}`;
  } catch (e) {
    return path;
  }
}

// Server-side config equivalent (replaces getConfig())
function getServerConfig(request) {
  // Determine locale from request using determineLocale function
  const locale = request ? determineLocale(request) : { ietf: 'en-US', prefix: '' };
  
  // Determine codeRoot from request hostname
  const hostname = request?.host || 'www.adobe.com';
  const codeRoot = `https://${hostname}`;
  
  // Determine locales (this would need to be configured based on your setup)
  // For now, using common Adobe locales
  const locales = {
    'us': true, 'en': true, 'jp': true, 'kr': true, 'eu': true, 'uk': true,
    'de': true, 'fr': true, 'es': true, 'it': true, 'ca': true, 'au': true
  };
  
  return {
    codeRoot,
    locale,
    locales
  };
}

// Federated URL handling (mirrors client-side getFederatedUrl)
function getFederatedUrl(url, request) {
  if (typeof url !== 'string' || !url.includes('/federal/')) return url;
  
  // For server-side, we need to determine the federated content root
  // This should be configurable based on your environment
  const federatedContentRoot = getFederatedContentRoot(request);
  
  if (url.startsWith('/')) {
    return `${federatedContentRoot}${url}`;
  }
  
  try {
    const parsedUrl = parseURL(url);
    
    const { pathname, search, hash } = parsedUrl;
    return `${federatedContentRoot}${pathname}${search}${hash}`;
  } catch (e) {
    // Server-side equivalent of window.lana?.log
    console.log(`getFederatedUrl errored parsing the URL: ${url}: ${e}`);
  }
  
  return url;
}

// Federated content root (server-side equivalent of utils.js getFederatedContentRoot)
function getFederatedContentRoot(request) {
  const cdnWhitelistedOrigins = [
    'https://www.adobe.com',
    'https://business.adobe.com',
    'https://blog.adobe.com',
    'https://milo.adobe.com',
    'https://news.adobe.com',
    'graybox.adobe.com',
  ];
  
  // Get origin from request
  const origin = request?.host ? `https://${request.host}` : 'https://www.adobe.com';
  
  // Check if origin is allowed
  const isAllowedOrigin = cdnWhitelistedOrigins.some((o) => {
    const originNoStage = origin.replace('.stage', '');
    return o.startsWith('https://')
      ? originNoStage === o
      : originNoStage.endsWith(o);
  });
  
  let federatedContentRoot = isAllowedOrigin ? origin : 'https://www.adobe.com';
  
  // Handle localhost and AEM environments
  if (origin.includes('localhost') || origin.includes('.page') || origin.includes('.live')) {
    federatedContentRoot = `https://main--federal--adobecom.aem.${origin.includes('.live') ? 'live' : 'page'}`;
  }
  
  return federatedContentRoot;
}

// Determine locale from request
export function determineLocale(request) {
  const acceptLanguage = request.getHeaders()["Accept-Language"] || "";
  const defaultLocale = { ietf: "en-US", language: "en", country: "US", prefix: "" };

  // Parse pathname from request
  const pathname = request.path;
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
}

// Get file name from path (like client-side getFileName)
export const getFileName = (path) => path?.split('/').pop();

// Replace placeholders in content (exactly like client-side replaceText from placeholders.js)
export function replacePlaceholders(value, ph) {
  // Handle null/undefined values
  if (typeof value !== 'string' || !value.length) return value;
  
  const placeholders = ph || {};
  
  // Use the exact same regex as client-side placeholders.js
  const regex = /{{(.*?)}}|%7B%7B(.*?)%7D%7D/g;
  const matches = [...value.matchAll(new RegExp(regex))];
  
  if (!matches.length) {
    return value;
  }
  
  // Extract keys from matches (exactly like client-side)
  const keys = Array.from(matches, (match) => match[1] || match[2]);
  
  // Get placeholder values for each key (like client-side getPlaceholder)
  const placeholderValues = keys.map(key => {
    const trimmedKey = key.trim();
    if (placeholders.hasOwnProperty(trimmedKey)) {
      return placeholders[trimmedKey];
    }
    // Fallback: convert key to string (like client-side keyToStr)
    return trimmedKey.replace(/-/g, ' ');
  });
  
  // Replace all matches (exactly like client-side)
  let finalText = value;
  let i = 0;
  finalText = finalText.replace(regex, () => placeholderValues[i++]);
  
  // Handle non-breaking spaces (exactly like client-side)
  finalText = finalText.replace(/&nbsp;/g, '\u00A0');
  
  return finalText;
}
