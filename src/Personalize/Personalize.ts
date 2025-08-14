import { determineLocale } from "../Utilities/Utilities";
import { httpRequest } from "http-request";
import { logger } from "log";

// Phase 1: Core Constants and Configuration
// Personalization tags and keys
export const PERSONALIZATION_TAGS = {
  all: () => true,
  chrome: () => true, // Server-side: always true
  firefox: () => true, // Server-side: always true
  safari: () => true, // Server-side: always true
  edge: () => true, // Server-side: always true
  android: () => true, // Server-side: always true
  ios: () => true, // Server-side: always true
  windows: () => true, // Server-side: always true
  mac: () => true, // Server-side: always true
  'mobile-device': () => true, // Server-side: always true
  phone: () => true, // Server-side: always true
  tablet: () => true, // Server-side: always true
  desktop: () => true, // Server-side: always true
  loggedout: () => true, // Will be determined by auth state
  loggedin: () => true, // Will be determined by auth state
};

export const PERSONALIZATION_KEYS = Object.keys(PERSONALIZATION_TAGS);

// Core constants
export const CLASS_EL_DELETE = 'p13n-deleted';
export const CLASS_EL_REPLACE = 'p13n-replaced';
export const COLUMN_NOT_OPERATOR = 'not ';
export const TARGET_EXP_PREFIX = 'target-';
export const INLINE_HASH = '_inline';
export const MARTECH_RETURNED_EVENT = 'martechReturned';

// Flags
export const FLAGS = {
  all: 'all',
  includeFragments: 'include-fragments',
};

export const TRACKED_MANIFEST_TYPE = 'personalization';

// Replace any non-alpha chars except comma, space, ampersand, colon, and hyphen
export const RE_KEY_REPLACE = /[^a-z0-9\- _,&=:]/g;

export const MANIFEST_KEYS = [
  'action',
  'selector',
  'pagefilter',
  'page filter',
  'page filter optional',
];

export const DATA_TYPE = {
  JSON: 'json',
  TEXT: 'text',
};

export const IN_BLOCK_SELECTOR_PREFIX = 'in-block:';

// Utility functions
export const isDamContent = (path: string) => path?.includes('/content/dam/');

export const toLowerAlpha = (str: string) => str?.toLowerCase().replace(RE_KEY_REPLACE, '');

export const normalizeKeys = (obj: any) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const normalized: any = Array.isArray(obj) ? [] : {};
  
  Object.keys(obj).forEach(key => {
    const normalizedKey = toLowerAlpha(key);
    normalized[normalizedKey] = normalizeKeys(obj[key]);
  });
  
  return normalized;
};

// Logging utility
export const log = (...msg: any[]) => {
  logger.log('Personalization:', ...msg);
};

// Configuration helper
export const getPersonalizationConfig = (request: any, url: any) => {
  return {
    locale: {
      ietf: 'en-US', // Will be determined by determineLocale
    },
    codeRoot: '/',
    // Add other config properties as needed
  };
};

// Phase 2: Path Normalization and URL Handling
// Constants for path handling
export const US_GEO = 'en-us';

// URL and path normalization functions
export const normalizePath = (p: string, localize = true, config?: any) => {
  let path = p;

  if (isDamContent(path) || !path?.includes('/')) return path;

  if (path.includes('/federal/')) {
    // For server-side, we'll handle federated URLs differently
    return path;
  }

  // Server-side adaptation - we don't have config.codeRoot in the same way
  if (!path.startsWith('http') && !path.startsWith('/')) {
    path = `/${path}`;
  }

  try {
    // Server-side URL parsing
    const urlParts = path.split('?');
    const pathname = urlParts[0];
    const query = urlParts[1] || '';

    // Handle different URL patterns for server-side
    if (path.includes('.hlx.') || 
        path.includes('.aem.') || 
        path.includes('.adobe.') || 
        path.includes('localhost:')) {
      
      if (!localize || (config?.locale?.ietf === 'en-US')) {
        return path;
      }

      // Handle localization for server-side
      const localizedPath = localizePath(path, config?.locale?.ietf);
      return query ? `${localizedPath}?${query}` : localizedPath;
    }

    // Handle hash for server-side
    if (path.includes('#')) {
      const [basePath, hash] = path.split('#');
      const localizedBase = localizePath(basePath, config?.locale?.ietf);
      return `${localizedBase}#${hash}`;
    }

    return path;
  } catch (error) {
    logger.log('Error normalizing path:', error);
    return path;
  }
};

// Server-side path localization
export const localizePath = (path: string, locale?: string) => {
  if (!locale || locale === 'en-US') return path;
  
  // Add locale prefix for non-English paths
  const pathParts = path.split('/');
  if (pathParts.length > 1 && !pathParts[1].includes('-')) {
    pathParts.splice(1, 0, locale.toLowerCase());
    return pathParts.join('/');
  }
  
  return path;
};

// Get file name from path
export const getFileName = (path: string) => path?.split('/').pop();

// Check if element is in LCP section (server-side adaptation)
export const isInLcpSection = (el: any) => {
  // Server-side: we don't have DOM elements, so this is adapted
  // In server-side context, we'll determine LCP sections differently
  return false;
};

// URL manipulation utilities
export const addHash = (url: string, newHash: string) => {
  if (!url) return url;
  
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${newHash}`;
};

// Path validation
export const isValidPath = (path: string) => {
  if (!path) return false;
  
  // Basic path validation for server-side
  return path.startsWith('/') || path.startsWith('http') || path.includes('.');
};

// URL construction for server-side
export const constructUrl = (baseUrl: string, path: string, query?: string) => {
  if (!baseUrl || !path) return path;
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${baseUrl}${cleanPath}`;
  
  return query ? `${fullUrl}?${query}` : fullUrl;
};

// Extract domain from URL
export const getDomain = (url: string) => {
  try {
    // Server-side URL parsing
    if (url.startsWith('http')) {
      const domainMatch = url.match(/https?:\/\/([^\/]+)/);
      return domainMatch ? domainMatch[1] : '';
    }
    return '';
  } catch (error) {
    logger.log('Error extracting domain:', error);
    return '';
  }
};

// Path comparison utilities
export const pathsMatch = (path1: string, path2: string) => {
  const normalize = (p: string) => p?.replace(/\/$/, '').toLowerCase();
  return normalize(path1) === normalize(path2);
};

// Extract query parameters
export const getQueryParams = (url: string) => {
  const params: Record<string, string> = {};
  
  try {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return params;
    
    const queryString = url.substring(queryIndex + 1);
    const pairs = queryString.split('&');
    
    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
      }
    });
  } catch (error) {
    logger.log('Error parsing query params:', error);
  }
  
  return params;
};

export type ProcessedData = { [key: string]: unknown };

export async function getPersonalizationData(request, authState) {
  const startTime = Date.now();
  ////logger.log("Making Interact Call");
  
  try {
    const rawData = await fetchPersonalizationData(request, authState);
    const parsedData = parseRawData(rawData);
    
    const endTime = Date.now();
    // logger.log(`Personalization data processing completed in ${endTime - startTime}ms`);
    // logger.log(`Found ${parsedData.fragments?.length || 0} fragments and ${parsedData.commands?.length || 0} commands`);
    
    return parsedData;
  } catch (error) {
    const endTime = Date.now();
    logger.log(`Personalization data processing failed after ${endTime - startTime}ms: ${error}`);
    throw error;
  }
}

async function fetchPersonalizationData(request, authState) {
  // Use proper Akamai EdgeWorker request properties
  const scheme = request.scheme; // 'http' or 'https'
  const host = request.host;     // e.g., 'www.stage.adobe.com'
  const path = request.path;     // e.g., '/products/photoshop' (without query)
  const query = request.query;   // e.g., 'edge_test=true&edge-pers=on'
  
  // Add .html extension if not present and path doesn't end with a file extension
  let pathWithExtension = path;
  if (!path.includes('.') && !path.endsWith('/')) {
    pathWithExtension = path + '.html';
  }
  
  // Construct full URL with query string
  const fullUrl = query ? `${scheme}://${host}${pathWithExtension}?${query}` : `${scheme}://${host}${pathWithExtension}`;
  
  // Improved URL parsing using the full URL
  const hostname = host;
  const pathname = pathWithExtension;
  
  const url = {
    href: fullUrl,
    hostname: hostname,
    pathname: pathname,
    searchParams: {
      get: (param) => {
        if (!query) return null;
        
        // Manual URLSearchParams implementation for Akamai EdgeWorkers
        const params = {};
        query.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key) {
            params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
          }
        });
        
        return params[param] || null;
      }
    }
  };
  
  const env = [
    "stage",
    "dev",
    "test",
    "localhost",
    ".page",
    ".live"
  ].some(str => url.hostname.includes(str)) ? "stage" : "prod";
  
  const locale = determineLocale(request, url);
  
  // Define constants based on environment
  const DATA_STREAM_ID =
    env === "prod" ? "913eac4d-900b-45e8-9ee7-306216765cd2" : "e065836d-be57-47ef-b8d1-999e1657e8fd";
  const TARGET_API_URL = `https://www.stage.adobe.com/experienceedge/v2/interact`;

  // Get device info (server-side adaptation)
  const deviceInfo = {
    screenWidth: 1920,
    screenHeight: 1080,
    screenOrientation: "landscape",
    viewportWidth: 1920,
    viewportHeight: 1080,
  };

  // Get current date and time
  const CURRENT_DATE = new Date();
  const localTime = CURRENT_DATE.toISOString();
  const timezoneOffset = CURRENT_DATE.getTimezoneOffset();

  // Create updated context
  const updatedContext = {
    device: {
      screenHeight: deviceInfo.screenHeight,
      screenWidth: deviceInfo.screenWidth,
      screenOrientation: deviceInfo.screenOrientation,
    },
    environment: {
      type: "browser",
      browserDetails: {
        viewportWidth: deviceInfo.viewportWidth,
        viewportHeight: deviceInfo.viewportHeight,
      },
    },
    placeContext: {
      localTime,
      localTimezoneOffset: timezoneOffset,
    },
  };

  // Get page name for analytics
  const pageName = `${locale.ietf}:${pathname.replace(/^\//, "").replace(/\/$/, "") || "home"}`;

  // Create request payload
  const requestBody = createRequestPayload({
    updatedContext,
    pageName,
    locale,
    env,
    url,
    request,
    DATA_STREAM_ID,
    authState,
  });

  // Log the request payload for debugging
  ////logger.log("=== ADOBE TARGET REQUEST ===");
  ////logger.log("URL:", `${TARGET_API_URL}?dataStreamId=${DATA_STREAM_ID}&requestId=${generateUUIDv4()}`);
  ////logger.log("Environment:", env);
  ////logger.log("Data Stream ID:", DATA_STREAM_ID);
  ////logger.log("Request Payload:", JSON.stringify(requestBody, null, 2));
  ////logger.log("=== END REQUEST ===");

  // Make the request to Adobe Target using httpRequest instead of fetch
  const targetResp = await httpRequest(`${TARGET_API_URL}?dataStreamId=${DATA_STREAM_ID}&requestId=${generateUUIDv4()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  // Log the response for debugging
  // logger.log("=== ADOBE TARGET RESPONSE ===");
  // logger.log("Status:", targetResp.status);
  // logger.log("Status Text:", targetResp.statusText);
  // logger.log("Headers:", JSON.stringify(targetResp.getHeaders(), null, 2));

  // if (targetResp.status !== 200) {
  //   logger.error("Target API Error Status:", targetResp.status);
  //   const errorText = await targetResp.text();
  //   logger.error("Error Response Body:", errorText);
  //   throw new Error(`Failed to fetch interact call: ${targetResp.status} - ${errorText}`);
  // }

  const responseData = await targetResp.json();
  // logger.log("Response Data:", JSON.stringify(responseData, null, 2));
  ////logger.log("=== END RESPONSE ===");

  return responseData;
}

// Create request payload for Adobe Target
function createRequestPayload({ updatedContext, pageName, locale, env, url, request, DATA_STREAM_ID, authState }) {
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

  const prevPageName = cookies['gpv'];
  const AT_PROPERTY_VAL = getTargetPropertyBasedOnPageRegion({ env, pathname: url.pathname });
  const REPORT_SUITES_ID = env === "prod" ? ["adbadobenonacdcprod"] : ["adbadobenonacdcqa"];

  // Get state entries from cookies
  const KNDCTR_COOKIE_KEYS = [
    'kndctr_9E1005A551ED61CA0A490D45_AdobeOrg_identity',
    'kndctr_9E1005A551ED61CA0A490D45_AdobeOrg_cluster',
  ];

  const stateEntries = Object.entries(cookies)
    .filter(([key]) => KNDCTR_COOKIE_KEYS.includes(key))
    .map(([key, value]) => ({ key, value }));

  return {
    "event": {
      "xdm": {
        ...updatedContext,
        "identityMap": getOrGenerateUserId(cookies),
        "web": {
          "webPageDetails": {
            "URL": url.href,
            "siteSection": url.hostname,
            "server": url.hostname,
            "isErrorPage": false,
            "isHomePage": false,
            "name": pageName,
            "pageViews": {
              "value": 0
            }
          },
          webInteraction: {
            name: 'Martech-API',
            type: 'other',
            linkClicks: { value: 1 },
          },
          "webReferrer": {
            "URL": request.getHeaders()["Referer"] || ""
          }
        },
        "timestamp": new Date().toISOString(),
        "eventType": "decisioning.propositionFetch",
      },
      "data": {
        "__adobe": {
          "target": {
            "is404": false,
            "authState": authState.type === "LoggedIn" ? "authenticated" : "loggedOut",
            "hitType": "propositionFetch",
            "isMilo": true,
            "adobeLocale": locale.ietf,
            "hasGnav": true,
          }
        },
        "_adobe_corpnew": {
          marketingtech: { adobe: { alloy: { approach: 'martech-API' } } },
          "digitalData": {
            "page": {
              "pageInfo": {
                "language": locale.ietf,
              }
            },
            "diagnostic": {
              "franklin": {
                "implementation": "milo"
              }
            },
            "previousPage": {
              "pageInfo": {
                "pageName": prevPageName
              }
            },
            "primaryUser": {
              "primaryProfile": {
                "profileInfo": authState.data,
              }
            },
          }
        },
      }
    },
    "query": {
      "identity": {
        "fetch": [
          "ECID"
        ]
      },
      "personalization": {
        "schemas": [
          "https://ns.adobe.com/personalization/default-content-item",
          "https://ns.adobe.com/personalization/html-content-item",
          "https://ns.adobe.com/personalization/json-content-item",
          "https://ns.adobe.com/personalization/redirect-item",
          "https://ns.adobe.com/personalization/ruleset-item",
          "https://ns.adobe.com/personalization/message/in-app",
          "https://ns.adobe.com/personalization/message/content-card",
          "https://ns.adobe.com/personalization/dom-action"
        ],
        "decisionScopes": [
          '__view__'
        ]
      }
    },
    "meta": {
      "target": {
        "migration": true
      },
      "configOverrides": {
        "com_adobe_analytics": {
          "reportSuites": REPORT_SUITES_ID
        },
        "com_adobe_target": {
          "propertyToken": AT_PROPERTY_VAL
        }
      },
      "state": {
        "domain": url.hostname,
        "cookiesEnabled": true,
        "entries": stateEntries
      }
    }
  };
}

function getTargetPropertyBasedOnPageRegion({ env, pathname }) {
  if (env !== 'prod') return 'bc8dfa27-29cc-625c-22ea-f7ccebfc6231';

  // EMEA & LATAM
  if (
    pathname.search(
      /(\/africa\/|\/be_en\/|\/be_fr\/|\/be_nl\/|\/cis_en\/|\/cy_en\/|\/dk\/|\/de\/|\/ee\/|\/es\/|\/fr\/|\/gr_en\/|\/ie\/|\/il_en\/|\/it\/|\/lv\/|\/lu_de\/|\/lu_en\/|\/lu_fr\/|\/hu\/|\/mt\/|\/mena_en\/|\/nl\/|\/no\/|\/pl\/|\/pt\/|\/ro\/|\/ch_de\/|\/si\/|\/sk\/|\/ch_fr\/|\/fi\/|\/se\/|\/ch_it\/|\/tr\/|\/uk\/|\/at\/|\/cz\/|\/bg\/|\/ru\/|\/cis_ru\/|\/ua\/|\/il_he\/|\/mena_ar\/|\/lt\/|\/sa_en\/|\/ae_en\/|\/ae_ar\/|\/sa_ar\/|\/ng\/|\/za\/|\/qa_ar\/|\/eg_en\/|\/eg_ar\/|\/kw_ar\/|\/eg_ar\/|\/qa_en\/|\/kw_en\/|\/gr_el\/|\/br\/|\/cl\/|\/la\/|\/mx\/|\/co\/|\/ar\/|\/pe\/|\/gt\/|\/pr\/|\/ec\/|\/cr\/)/,
    ) !== -1
  ) {
    return '488edf5f-3cbe-f410-0953-8c0c5c323772';
  }
  
  // APAC
  if (
    pathname.search(
      /(\/au\/|\/hk_en\/|\/in\/|\/nz\/|\/sea\/|\/cn\/|\/hk_zh\/|\/tw\/|\/kr\/|\/sg\/|\/th_en\/|\/th_th\/|\/my_en\/|\/my_ms\/|\/ph_en\/|\/ph_fil\/|\/vn_en\/|\/vn_vi\/|\/in_hi\/|\/id_id\/|\/id_en\/)/,
    ) !== -1
  ) {
    return '3de509ee-bbc7-58a3-0851-600d1c2e2918';
  }
  
  // JP
  if (pathname.indexOf('/jp/') !== -1) {
    return 'ba5bc9e8-8fb4-037a-12c8-682384720007';
  }

  return '4db35ee5-63ad-59f6-cec6-82ef8863b22d'; // Default
}

const AMCV_COOKIE = 'AMCV_9E1005A551ED61CA0A490D45@AdobeOrg';

function getOrGenerateUserId(cookies) {
  const amcvCookieValue = cookies[AMCV_COOKIE];

  // If ECID is not found, generate and return FPID
  if (!amcvCookieValue || (amcvCookieValue.indexOf('MCMID|') === -1)) {
    const fpidValue = generateUUIDv4();
    return {
      FPID: [{
        id: fpidValue,
        authenticatedState: 'ambiguous',
        primary: true,
      }],
    };
  }

  return {
    ECID: [{
      id: amcvCookieValue.match(/MCMID\|([^|]+)/)?.[1],
      authenticatedState: 'ambiguous',
      primary: true,
    }],
  };
}

function generateUUIDv4() {
  // Use Math.random() since crypto.getRandomValues might not be available in Akamai EdgeWorkers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function parseRawData(targetData) {
  // Extract personalization decisions
  const propositions = targetData?.handle?.find(d => d.type === "personalization:decisions")?.payload || [];

  if (propositions.length === 0) {
    return { fragments: [], commands: [] };
  }

  ////logger.log(`Found ${propositions.length} propositions`);

  // Process propositions to extract fragments and commands
  const fragments = [];
  const commands = [];

  propositions.forEach(proposition => {
    proposition.items?.forEach(item => {
      if (item.data?.format === "application/json") {
        const content = item.data.content;
        if (content?.manifestContent) {
          const experiences = content.manifestContent?.experiences?.data || content.manifestContent?.data || [];

          experiences.forEach(experience => {
            const action = experience.action
              ?.toLowerCase()
              .replace("content", "")
              .replace("fragment", "")
              .replace("tosection", "");

            const selector = experience.selector;
            const variantNames = Object.keys(experience).filter(
              key => !["action", "selector", "pagefilter", "page filter", "page filter optional"].includes(
                key.toLowerCase()
              )
            );

            variantNames.forEach(variant => {
              if (!experience[variant] || experience[variant].toLowerCase() === "false") return;

              if (getSelectorType(selector) === "fragment") {
                fragments.push({
                  selector: normalizePath(selector.split(" #_")[0]),
                  val: normalizePath(experience[variant]),
                  action,
                  manifestId: content.manifestPath,
                  targetManifestId: item.meta?.["activity.name"]
                });
              } else if (action === "remove" || action === "replace" || action === "updateattribute") {
                commands.push({
                  action,
                  selector,
                  content: experience[variant],
                  selectorType: getSelectorType(selector),
                  manifestId: content.manifestPath,
                  targetManifestId: item.meta?.["activity.name"]
                });
              }
            });
          });
        }
      }
    });
  });

  return { fragments, commands };
}

// Helper function to determine selector type
function getSelectorType(selector) {
  const sel = selector?.toLowerCase().trim();
  if (sel?.startsWith("/") || sel?.startsWith("http")) return "fragment";
  return "other";
}

export function getEntitlementCreativeCloud(profile, scope) {
  if (
    scope
    && scope.indexOf('creative_cloud') !== -1
    && profile
    && profile.serviceAccounts
  ) {
    const serviceAccount = profile.serviceAccounts.find(
      (sa) => sa.serviceCode === 'creative_cloud',
    );

    if (!serviceAccount) {
      return 'notEntitled';
    }

    if (serviceAccount.serviceLevel === 'CS_LVL_2') {
      return 'paid';
    } if (serviceAccount.serviceLevel === 'CS_LVL_1') {
      return 'free';
    }
    return 'notEntitled';
  }
  return 'notEntitled';
}

export function getEntitlementStatusCreativeCloud(profile, scope) {
  if (
    scope
    && scope.indexOf('creative_cloud') !== -1
    && profile
    && profile.serviceAccounts
  ) {
    const serviceAccount = profile.serviceAccounts.find(
      (sa) => sa.serviceCode === 'creative_cloud',
    );
    return serviceAccount?.serviceStatus || 'none';
  }
  return 'none';
}

// Phase 3: Selector and Element Handling Functions
// Migrated from personalization.js

// Global commands for server-side adaptation
const GLOBAL_CMDS = [
  'insertscript',
  'replacepage',
  'updatemetadata',
  'useblockcode',
];

// Create commands mapping
const CREATE_CMDS = {
  insertafter: 'afterend',
  insertbefore: 'beforebegin',
  prepend: 'afterbegin',
  append: 'beforeend',
};

// Commands keys
const COMMANDS_KEYS = {
  remove: 'remove',
  replace: 'replace',
  updateAttribute: 'updateattribute',
};

// Helper function to add IDs to elements (server-side adaptation)
function addIds(el: any, manifestId: string, targetManifestId: string) {
  logger.log('Phase 3: Adding IDs to element:', { manifestId, targetManifestId });
  if (manifestId) el.dataset.manifestId = manifestId;
  if (targetManifestId) el.dataset.adobeTargetTestid = targetManifestId;
}

// Helper function to update end number in selector terms
const updateEndNumber = (endNumber: string, term: string) => (endNumber
  ? `${term}:nth-child(${endNumber})`
  : term);

// Function to modify selector terms for server-side
function modifySelectorTerm(termParam: string) {
  logger.log('Phase 3: Modifying selector term:', termParam);
  let term = termParam;
  const specificSelectors = {
    section: 'main > div',
    'primary-cta': 'strong a',
    'secondary-cta': 'em a',
    'action-area': '*:has(> em a, > strong a)',
    'any-marquee-section': 'main > div:has([class*="marquee"])',
    'any-marquee': '[class*="marquee"]',
    'any-header': ':is(h1, h2, h3, h4, h5, h6)',
  };
  const otherSelectors = ['row', 'col'];
  const htmlEls = [
    'html', 'body', 'header', 'footer', 'main',
    'div', 'a', 'p', 'strong', 'em', 'picture', 'source', 'img', 'h',
    'ul', 'ol', 'li',
  ];
  
  const startTextMatch = term.match(/^[a-zA-Z/./-]*/);
  const startText = startTextMatch ? startTextMatch[0].toLowerCase() : '';
  const startTextPart1 = startText.split(/\.|:/)[0];
  const endNumberMatch = term.match(/[0-9]*$/);
  const endNumber = endNumberMatch && startText.match(/^[a-zA-Z]/) ? endNumberMatch[0] : '';
  
  if (!startText || htmlEls.includes(startText)) return term;
  if (otherSelectors.includes(startText)) {
    term = term.replace(startText, '> div');
    term = updateEndNumber(endNumber, term);
    logger.log('Phase 3: Modified term (other selector):', term);
    return term;
  }
  if (Object.keys(specificSelectors).includes(startTextPart1)) {
    term = term.replace(startTextPart1, specificSelectors[startTextPart1]);
    term = updateEndNumber(endNumber, term);
    logger.log('Phase 3: Modified term (specific selector):', term);
    return term;
  }

  if (!startText.startsWith('.')) term = `.${term}`;
  if (endNumber) {
    term = term.replace(endNumber, '');
    term = `${term}:nth-child(${endNumber} of ${term})`;
  }
  logger.log('Phase 3: Final modified term:', term);
  return term;
}

// Function to get modifiers from selector
function getModifiers(selector: string) {
  logger.log('Phase 3: Getting modifiers from selector:', selector);
  let sel = selector;
  const modifiers: string[] = [];
  const flags = sel.split(/\s+#_/);
  if (flags.length) {
    sel = flags.shift() || '';
    flags.forEach((flag) => {
      flag.split(/_|#_/).forEach((mod) => modifiers.push(mod.toLowerCase().trim()));
    });
  }
  logger.log('Phase 3: Extracted modifiers:', { sel, modifiers });
  return { sel, modifiers };
}

// Function to modify non-fragment selectors
export function modifyNonFragmentSelector(selector: string, action: string) {
  logger.log('Phase 3: Modifying non-fragment selector:', { selector, action });
  const { sel, modifiers } = getModifiers(selector);

  let modifiedSelector = sel
    .split('>').join(' > ')
    .split(',').join(' , ')
    .replaceAll(/main\s*>?\s*(section\d*)/gi, '$1')
    .split(/\s+/)
    .map(modifySelectorTerm)
    .join(' ')
    .trim();

  let attribute = '';

  if (action === COMMANDS_KEYS.updateAttribute) {
    const string = modifiedSelector.split(' ').pop() || '';
    attribute = string.replace('.', '');
    modifiedSelector = modifiedSelector.replace(string, '').trim();
  }

  const result = {
    modifiedSelector,
    modifiers,
    attribute,
  };
  
  logger.log('Phase 3: Modified selector result:', result);
  return result;
}

// Function to get selected elements (server-side adaptation)
function getSelectedElements(sel: string, rootEl: any, forceRootEl: boolean, action: string) {
  logger.log('Phase 3: Getting selected elements:', { sel, forceRootEl, action });
  const root = forceRootEl ? rootEl : null; // Server-side: no document object
  const selector = sel.trim();
  if (!selector) return {};

  if (getSelectorType(selector) === 'fragment') {
    try {
      // Server-side: we'll handle fragments differently
      logger.log('Phase 3: Processing fragment selector:', selector);
      return { els: [], modifiers: [FLAGS.all, FLAGS.includeFragments] };
    } catch (e) {
      logger.log('Phase 3: Error processing fragment selector:', e);
      return { els: [], modifiers: [] };
    }
  }
  
  const {
    modifiedSelector,
    modifiers,
    attribute,
  } = modifyNonFragmentSelector(selector, action);

  logger.log('Phase 3: Modified selector:', modifiedSelector);
  logger.log('Phase 3: Modifiers:', modifiers);
  logger.log('Phase 3: Attribute:', attribute);

  // Server-side: we don't have DOM querying, so return empty for now
  return { els: [], modifiers, attribute };
}

// Function to replace placeholders in content
export function replacePlaceholders(value: string, ph?: any) {
  logger.log('Phase 3: Replacing placeholders in value:', value);
  const placeholders = ph || {}; // Server-side: simplified placeholders
  if (!placeholders) return value;
  let val = value;
  const matches = val.match(/{{(.*?)}}/g);
  if (!matches) return val;
  matches.forEach((match) => {
    const key = match.replace(/{{|}}/g, '').trim();
    if (placeholders[key]) {
      val = val.replace(match, placeholders[key]);
      logger.log('Phase 3: Replaced placeholder:', { key, value: placeholders[key] });
    }
  });
  logger.log('Phase 3: Final value after placeholder replacement:', val);
  return val;
}

// Function to get updated href (server-side adaptation)
const getUpdatedHref = (el: any, content: string, action: string) => {
  logger.log('Phase 3: Getting updated href:', { content, action });
  const href = el.getAttribute('href');
  const newContent = replacePlaceholders(content);
  let result = href;
  if (action === 'insertafter' || action === 'append') result = `${href}${newContent}`;
  if (action === 'insertbefore' || action === 'prepend') result = `${newContent}${href}`;
  if (action === 'replace') result = newContent;
  logger.log('Phase 3: Updated href result:', result);
  return result;
};

// Function to create fragment (server-side adaptation)
const createFrag = (el: any, action: string, content: string, manifestId: string, targetManifestId: string) => {
  logger.log('Phase 3: Creating fragment:', { action, content, manifestId, targetManifestId });
  if (action === 'replace') el.classList.add(CLASS_EL_DELETE, CLASS_EL_REPLACE);
  let href = content;
  try {
    const { pathname, search, hash } = new URL(content);
    href = `${pathname}${search}${hash}`;
  } catch {
    // ignore
  }
  
  // Server-side: simplified fragment creation
  const a = { href, textContent: content }; // Simplified element representation
  addIds(a, manifestId, targetManifestId);
  
  logger.log('Phase 3: Created fragment with href:', href);
  return a;
};

// Function to create content (server-side adaptation)
export const createContent = (el: any, { content, manifestId, targetManifestId, action, modifiers }: any) => {
  logger.log('Phase 3: Creating content:', { action, content, modifiers });
  
  if (action === 'replace') {
    addIds(el, manifestId, targetManifestId);
  }
  
  if (el?.nodeName === 'A' && modifiers?.includes('href')) {
    el.href = getUpdatedHref(el, content, action);
    return el;
  }
  
  if (getSelectorType(content) === 'fragment') {
    return createFrag(el, action, content, manifestId, targetManifestId);
  }
  
  // Server-side: simplified content creation
  logger.log('Phase 3: Creating content for action:', action);
  return { textContent: replacePlaceholders(content) };
};

// Function to set data ID on children (server-side adaptation)
const setDataIdOnChildren = (sections: any[], id: string, value: string) => {
  logger.log('Phase 3: Setting data ID on children:', { id, value });
  if (sections && sections[0] && sections[0].children) {
    [...sections[0].children].forEach(
      (child: any) => (child.dataset[id] = value),
    );
  }
};

// Function to update fragment data properties
export const updateFragDataProps = (a: any, inline: boolean, sections: any[], fragment: any) => {
  logger.log('Phase 3: Updating fragment data properties:', { inline });
  const { manifestId, adobeTargetTestid } = a.dataset;
  if (inline) {
    if (manifestId) setDataIdOnChildren(sections, 'manifestId', manifestId);
    if (adobeTargetTestid) setDataIdOnChildren(sections, 'adobeTargetTestid', adobeTargetTestid);
  } else {
    addIds(fragment, manifestId, adobeTargetTestid);
  }
};

// Function to delete marked elements (server-side adaptation)
export const deleteMarkedEls = (rootEl: any = null) => {
  logger.log('Phase 3: Deleting marked elements');
  // Server-side: simplified element removal
};

// Function to add section anchors (server-side adaptation)
export function addSectionAnchors(rootEl: any = null) {
  logger.log('Phase 3: Adding section anchors');
  // Server-side: simplified section anchor handling
}

// Function to handle commands (server-side adaptation)
export function handleCommands(
  commands: any[],
  rootEl: any = null,
  forceInline = false,
  forceRootEl = false,
) {
  logger.log('Phase 3: Handling commands:', { count: commands.length, forceInline, forceRootEl });
  
  addSectionAnchors(rootEl);
  commands.forEach((cmd, index) => {
    const { action, content, selector } = cmd;
    logger.log(`Phase 3: Processing command ${index + 1}:`, { action, selector });
    
    cmd.content = forceInline && getSelectorType(content) === 'fragment' ? addHash(content, INLINE_HASH) : content;
    
    if (selector.startsWith(IN_BLOCK_SELECTOR_PREFIX)) {
      logger.log('Phase 3: Processing in-block selector:', selector);
      cmd.selectorType = IN_BLOCK_SELECTOR_PREFIX;
      return;
    }
    
    const {
      els,
      modifiers,
      attribute,
    } = getSelectedElements(selector, rootEl, forceRootEl, action);

    Object.assign(cmd, { modifiers, attribute });

    logger.log('Phase 3: Command processed:', { action, selector, modifiers });
  });
  
  deleteMarkedEls(rootEl);
  return commands.filter((cmd) => !cmd.completed
    && cmd.selectorType !== IN_BLOCK_SELECTOR_PREFIX);
}

// Function to register in-block actions (server-side adaptation)
function registerInBlockActions(command: any) {
  logger.log('Phase 3: Registering in-block action:', command);
}

// Function to get block properties (server-side adaptation)
const getBlockProps = (fVal: string, config: any, origin: string) => {
  logger.log('Phase 3: Getting block properties:', { fVal, origin });
  // Server-side: simplified block properties
  return { blockSelector: fVal, blockTarget: fVal };
};

// Function to consolidate array
const consolidateArray = (arr: any[], prop: string, existing: any[] = []) => arr
  .reduce((acc, item) => (item[prop] ? [...acc, item[prop]] : acc), existing);

// Function to consolidate objects
const consolidateObjects = (arr: any[], prop: string, existing: any = {}) => arr.reduce((propMap, item) => {
  if (item[prop]) {
    propMap[item[prop]] = item;
  }
  return propMap;
}, existing);

// Function to match glob patterns
export const matchGlob = (searchStr: string, inputStr: string) => {
  logger.log('Phase 3: Matching glob pattern:', { searchStr, inputStr });
  const pattern = searchStr.replace(/\*/g, '.*');
  const regex = new RegExp(pattern, 'i');
  const result = regex.test(inputStr);
  logger.log('Phase 3: Glob match result:', result);
  return result;
};

// Function to replace inner content (server-side adaptation)
export async function replaceInner(path: string, element: any) {
  logger.log('Phase 3: Replacing inner content for path:', path);
  // Server-side: simplified content replacement
}

// Function to set metadata (server-side adaptation)
const setMetadata = (metadata: any) => {
  logger.log('Phase 3: Setting metadata:', metadata);
  // Server-side: simplified metadata handling
};

// Function to normalize fragment paths
const normalizeFragPaths = ({ selector, val, action, manifestId, targetManifestId }: any) => ({
  selector: normalizePath(selector),
  val: normalizePath(val),
  action,
  manifestId,
  targetManifestId,
});

// Function to categorize actions
export async function categorizeActions(experiment: any, config: any) {
  logger.log('Phase 3: Categorizing actions for experiment');
  
  const fragments: any[] = [];
  const commands: any[] = [];
  const globalCommands: any = {};

  // Process experiment data
  if (experiment.fragments) {
    experiment.fragments.forEach((frag: any) => {
      fragments.push(normalizeFragPaths(frag));
    });
  }

  if (experiment.commands) {
    experiment.commands.forEach((cmd: any) => {
      commands.push(cmd);
    });
  }

  // Process global commands
  GLOBAL_CMDS.forEach(cmdType => {
    if (experiment[cmdType]) {
      globalCommands[cmdType] = experiment[cmdType];
    }
  });

  logger.log('Phase 3: Categorized actions:', { fragments: fragments.length, commands: commands.length, globalCommands });

  return {
    fragments,
    commands,
    globalCommands,
  };
}

// Phase 4: Manifest Processing and Validation
// Migrated from personalization.js

// Function to fetch data from URL
export const fetchData = async (url: string, type = DATA_TYPE.JSON, config?: any) => {
  logger.log('Phase 4: Fetching data from URL:', url);
  
  try {
    // Server-side: use httpRequest instead of fetch
    const response = await httpRequest(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status !== 200) {
      logger.log('Phase 4: Error fetching data, status:', response.status);
      return null;
    }
    
    const data = await response.json();
    logger.log('Phase 4: Successfully fetched data:', data);
    return data;
  } catch (error) {
    logger.log('Phase 4: Error fetching data:', error);
    return null;
  }
};

// Function to create default experiment
const createDefaultExperiment = (manifest: any) => ({
  manifestPath: manifest.manifestPath || manifest.manifest,
  selectedVariantName: 'default',
  selectedVariant: 'default',
  manifestType: 'default',
  executionOrder: '1-1',
  disabled: true,
});

// Function to get personalization variant (server-side adaptation)
async function getPersonalizationVariant(
  manifestPath: string,
  variantNames: string[] = [],
  variantLabel: string | null = null,
) {
  logger.log('Phase 4: Getting personalization variant:', { manifestPath, variantNames, variantLabel });
  
  // Server-side: simplified variant selection
  // In a real implementation, this would use user context, A/B testing, etc.
  const hasMatch = (name: string) => {
    if (!variantLabel) return false;
    return name.toLowerCase().includes(variantLabel.toLowerCase());
  };
  
  const matchVariant = (n: string) => {
    if (hasMatch(n)) return n;
    return null;
  };
  
  const matchedVariant = variantNames.find(matchVariant);
  const selectedVariant = matchedVariant || 'default';
  
  logger.log('Phase 4: Selected variant:', selectedVariant);
  return selectedVariant;
}

// Function to get manifest configuration
export async function getManifestConfig(info: any = {}, variantOverride = false) {
  logger.log('Phase 4: Getting manifest config:', info);
  
  const {
    name,
    manifestData,
    manifestPath,
    manifestUrl,
    manifestPlaceholders,
    manifestInfo,
    variantLabel,
    disabled,
    event,
    source,
  } = info;
  
  if (disabled && (!variantOverride || !Object.keys(variantOverride).length)) {
    logger.log('Phase 4: Manifest disabled, creating default experiment');
    return createDefaultExperiment(info);
  }
  
  let data = manifestData;
  if (!data) {
    logger.log('Phase 4: Fetching manifest data from:', manifestPath);
    const fetchedData = await fetchData(manifestPath, DATA_TYPE.JSON);
    if (fetchedData) data = fetchedData;
  }

  const persData = data?.experiences?.data || data?.data || data;
  if (!persData) {
    logger.log('Phase 4: No personalization data found');
    return null;
  }
  
  const infoTab = manifestInfo || data?.info?.data;
  const infoObj = infoTab?.reduce((acc: any, item: any) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
  
  const manifestOverrideName = infoObj?.['manifest-override-name']?.toLowerCase();
  const targetId = name || manifestOverrideName;
  const manifestConfig = parseManifestVariants(persData, manifestPath, targetId);

  if (!manifestConfig) {
    logger.log('Phase 4: Error loading personalization manifestConfig:', name || manifestPath);
    return null;
  }
  
  const infoKeyMap = {
    'manifest-type': ['Personalization', 'Promo', 'Test'],
    'manifest-execution-order': ['First', 'Normal', 'Last'],
  };
  
  if (infoTab) {
    manifestConfig.manifestType = infoObj?.['manifest-type']?.toLowerCase();
    if (manifestConfig.manifestType === TRACKED_MANIFEST_TYPE) {
      manifestConfig.manifestOverrideName = manifestOverrideName;
      const analytics = manifestOverrideName || getFileName(manifestPath)?.replace('.json', '');
      manifestConfig.analyticsTitle = analytics?.trim().slice(0, 15);
    }
    const executionOrder = {
      'manifest-type': 1,
      'manifest-execution-order': 1,
    };
    Object.keys(infoObj).forEach((key) => {
      if (!infoKeyMap[key]) return;
      const index = infoKeyMap[key].indexOf(infoObj[key]);
      executionOrder[key] = index > -1 ? index : 1;
    });
    manifestConfig.executionOrder = `${executionOrder['manifest-execution-order']}-${executionOrder['manifest-type']}`;
  } else {
    manifestConfig.manifestType = infoKeyMap['manifest-type'][1];
    manifestConfig.executionOrder = '1-1';
  }

  manifestConfig.manifestPath = normalizePath(manifestPath);
  manifestConfig.selectedVariantName = await getPersonalizationVariant(
    manifestConfig.manifestPath,
    manifestConfig.variantNames,
    variantLabel,
  );

  manifestConfig.placeholderData = manifestPlaceholders || data?.placeholders?.data;
  manifestConfig.name = name;
  manifestConfig.manifest = manifestPath;
  manifestConfig.manifestUrl = manifestUrl;
  manifestConfig.disabled = disabled;
  manifestConfig.event = event;
  if (source?.length) manifestConfig.source = source;
  
  logger.log('Phase 4: Manifest config created:', manifestConfig);
  return manifestConfig;
}

// Function to parse manifest variants
export function parseManifestVariants(data: any, manifestPath: string, targetId: string) {
  logger.log('Phase 4: Parsing manifest variants:', { manifestPath, targetId });
  
  if (!data || !Array.isArray(data)) {
    logger.log('Phase 4: Invalid manifest data format');
    return null;
  }
  
  const variants: any = {};
  const variantNames: string[] = [];
  
  data.forEach((line: any) => {
    const variantInfo = getVariantInfo(line, variantNames, variants, manifestPath, targetId);
    if (variantInfo) {
      logger.log('Phase 4: Processed variant info:', variantInfo);
    }
  });
  
  if (Object.keys(variants).length === 0) {
    logger.log('Phase 4: No valid variants found');
    return null;
  }
  
  const result = {
    manifestPath,
    targetId,
    variants,
    variantNames,
  };
  
  logger.log('Phase 4: Parsed manifest variants:', result);
  return result;
}

// Function to get variant info
const getVariantInfo = (line: any, variantNames: string[], variants: any, manifestPath: string, fTargetId: string) => {
  logger.log('Phase 4: Getting variant info for line:', line);
  
  const config = getPersonalizationConfig({}, {});
  let manifestId = getFileName(manifestPath);
  let targetId = manifestId?.replace('.json', '');
  if (fTargetId) targetId = fTargetId;
  
  // Server-side: simplified preview handling
  if (!config?.mep?.preview) manifestId = false;
  
  const action = line.action?.toLowerCase()
    .replace('content', '').replace('fragment', '').replace('tosection', '');
  if (!action) {
    logger.log('Phase 4: Row found with empty action field:', line);
    return;
  }
  
  const pageFilter = line['page filter'] || line['page filter optional'];
  const { selector } = line;

  if (pageFilter && !matchGlob(pageFilter, '/products/photoshop')) {
    logger.log('Phase 4: Page filter mismatch:', pageFilter);
    return;
  }

  if (!config?.mep?.preview) manifestId = false;
  
  variantNames.forEach((vn) => {
    const targetManifestId = vn.includes(TARGET_EXP_PREFIX) ? targetId : false;
    if (!line[vn] || line[vn].toLowerCase() === 'false') return;

    const variantInfo = {
      action,
      selector,
      pageFilter,
      content: line[vn],
      selectorType: getSelectorType(selector),
      manifestId,
      targetManifestId,
    };

    if (action in COMMANDS_KEYS && variantInfo.selectorType === 'fragment') {
      if (!variants[vn]) variants[vn] = { fragments: [], commands: [] };
      variants[vn].fragments.push({
        selector: normalizePath(variantInfo.selector.split(' #_')[0]),
        val: normalizePath(line[vn]),
        action,
        manifestId,
        targetManifestId,
      });
    } else if (GLOBAL_CMDS.includes(action)) {
      if (!variants[vn]) variants[vn] = { fragments: [], commands: [] };
      variants[vn][action] = variants[vn][action] || [];

      if (action === 'useblockcode') {
        const { blockSelector, blockTarget } = getBlockProps(line[vn], config, 'https://www.adobe.com');
        variants[vn][action].push({
          selector: blockSelector,
          target: blockTarget,
          manifestId,
          targetManifestId,
        });
      } else {
        variants[vn][action].push({
          content: line[vn],
          manifestId,
          targetManifestId,
        });
      }
    } else {
      if (!variants[vn]) variants[vn] = { fragments: [], commands: [] };
      variants[vn].commands.push({
        action,
        selector,
        content: line[vn],
        selectorType: getSelectorType(selector),
        manifestId,
        targetManifestId,
      });
    }
  });
  
  return { action, selector, pageFilter };
};

// Function to parse MEP parameter
function parseMepParam(mepParam: string) {
  logger.log('Phase 4: Parsing MEP parameter:', mepParam);
  if (!mepParam) return false;
  
  const mepObject: any = Object.create(null);
  const decodedParam = decodeURIComponent(mepParam);
  decodedParam.split('---').forEach((item) => {
    const pair = item.trim().split('--');
    if (pair.length > 1) {
      const [manifestPath, selectedVariant] = pair;
      mepObject[manifestPath] = selectedVariant;
    }
  });

  logger.log('Phase 4: Parsed MEP object:', mepObject);
  return mepObject;
}

// Function to compare execution order
function compareExecutionOrder(a: any, b: any) {
  if (a.executionOrder === b.executionOrder) return 0;
  return a.executionOrder > b.executionOrder ? 1 : -1;
}

// Function to clean and sort manifest list
export function cleanAndSortManifestList(manifests: any[], config: any = {}) {
  logger.log('Phase 4: Cleaning and sorting manifest list:', manifests.length);
  
  const manifestObj: any = {};
  let allManifests = manifests;
  let targetManifestWinsOverServerManifest = false;
  
  if (config.mep?.experiments) allManifests = [...manifests, ...config.mep.experiments];
  
  allManifests.forEach((manifest) => {
    try {
      if (!manifest?.manifest) return;
      if (!manifest.manifestPath) manifest.manifestPath = normalizePath(manifest.manifest);
      if (manifest.source && !manifest.source.includes('target')) manifest.manifest = normalizePath(manifest.manifest);
      
      if (manifest.manifestPath in manifestObj) {
        let fullManifest = manifestObj[manifest.manifestPath];
        let freshManifest = manifest;
        if (manifest.name) {
          fullManifest = manifest;
          freshManifest = manifestObj[manifest.manifestPath];
        }
        freshManifest.source = freshManifest.source.concat(fullManifest.source);
        freshManifest.name = fullManifest.name;
        freshManifest.selectedVariantName = fullManifest.selectedVariantName;
        targetManifestWinsOverServerManifest = config?.env?.name === 'prod' && fullManifest.selectedVariantName.startsWith('target-');

        if (targetManifestWinsOverServerManifest) {
          freshManifest.variants = fullManifest.variants;
          freshManifest.placeholderData = fullManifest.placeholderData;
        }

        freshManifest.selectedVariant = freshManifest.variants[freshManifest.selectedVariantName];
        manifestObj[manifest.manifestPath] = freshManifest;
      } else {
        manifestObj[manifest.manifestPath] = manifest;
      }

      const manifestConfig = manifestObj[manifest.manifestPath];
      const { selectedVariantName, variantNames, placeholderData } = manifestConfig;

      if (selectedVariantName && variantNames.includes(selectedVariantName)) {
        manifestConfig.selectedVariant = manifestConfig.variants[selectedVariantName];
      } else {
        manifestConfig.selectedVariantName = 'default';
        manifestConfig.selectedVariant = 'default';
      }
      
      // Server-side: simplified placeholder parsing
      logger.log('Phase 4: Processing placeholders for manifest:', manifestConfig.name);
      
    } catch (e) {
      logger.log(`Phase 4: MEP Error parsing manifests: ${e.toString()}`);
    }
  });
  
  Object.keys(manifestObj).forEach((key) => {
    delete manifestObj[key].variants;
  });
  
  const result = Object.values(manifestObj).sort(compareExecutionOrder);
  logger.log('Phase 4: Cleaned and sorted manifest list:', result.length);
  return result;
}

// Function to handle fragment command
export function handleFragmentCommand(command: any, a: any) {
  logger.log('Phase 4: Handling fragment command:', command);
  
  const { action, fragment, manifestId, targetManifestId } = command;
  const addInline = (a.href.includes(INLINE_HASH) && !fragment.includes(INLINE_HASH));
  
  if (action === COMMANDS_KEYS.remove) {
    a.parentElement.remove();
    return null;
  }
  
  if (action === COMMANDS_KEYS.replace) {
    a.href = fragment;
    if (addInline) a.href += `#${INLINE_HASH}`;
    addIds(a, manifestId, targetManifestId);
    return fragment;
  }
  
  logger.log('Phase 4: Fragment command processed');
  return fragment;
}

// Function to parse nested placeholders
export function parseNestedPlaceholders({ placeholders }: any) {
  logger.log('Phase 4: Parsing nested placeholders');
  // Server-side: simplified placeholder parsing
  return placeholders;
}

// Function to apply personalization
export async function applyPers({ manifests }: any) {
  logger.log('Phase 4: Applying personalization for manifests:', manifests.length);
  
  const results = [];
  
  for (const manifest of manifests) {
    try {
      const categorized = await categorizeActions(manifest, {});
      results.push(categorized);
      logger.log('Phase 4: Applied personalization for manifest:', manifest.manifestPath);
    } catch (error) {
      logger.log('Phase 4: Error applying personalization for manifest:', error);
    }
  }
  
  return results;
}

// Phase 5: Content Transformation Integration
// Main personalization orchestration functions migrated from personalization.js

// Global state for personalization
let isPostLCP = false;

// Function to parse manifest URL and add source
function parseManifestUrlAndAddSource(manifestString: any, source: string) {
  logger.log('Phase 5: Parsing manifest URL and adding source:', { manifestString, source });
  if (!manifestString || typeof manifestString !== 'string') return [];
  
  return manifestString.toLowerCase()
    .split(/,|(\s+)|(\\n)/g)
    .filter((path) => path?.trim())
    .map((manifestPath) => ({ manifestPath, source: [source] }));
}

// Function to combine MEP sources (server-side adaptation)
export const combineMepSources = async (
  persEnabled: boolean,
  rocPersEnabled: boolean,
  promoEnabled: boolean,
  mepParam: string,
  request: any,
) => {
  logger.log('Phase 5: Combining MEP sources using getMepEnablement for consistency:', { persEnabled, rocPersEnabled, promoEnabled });
  
  let persManifests: any[] = [];

  if (persEnabled && typeof persEnabled === 'string') {
    persManifests = parseManifestUrlAndAddSource(persEnabled, 'pzn');
  }

  if (rocPersEnabled && typeof rocPersEnabled === 'string') {
    const rocPersManifest = parseManifestUrlAndAddSource(rocPersEnabled, 'pzn-roc');
    persManifests = persManifests.concat(rocPersManifest);
  }

  if (promoEnabled) {
    logger.log('Phase 5: Processing promotional sources using getMepEnablement');
    
    // Use getMepEnablement to get promo enablement
    const promoEnablement = getMepEnablement('manifestnames', PROMO_PARAM, request);
    logger.log('Phase 5: Promo enablement from getMepEnablement:', promoEnablement);
    
    if (promoEnablement && typeof promoEnablement === 'object' && Object.keys(promoEnablement).length > 0) {
      logger.log('Phase 5: Found promo manifests in enablement:', promoEnablement);
      // TODO: Process promo manifests when we have access to HTML content
      // For now, we'll log the enablement but skip processing
    } else {
      logger.log('Phase 5: No promo manifests found in enablement');
    }
  }

  if (mepParam && mepParam !== 'off') {
    const persManifestPaths = persManifests.map((manifest) => {
      const { manifestPath } = manifest;
      if (manifestPath?.startsWith('/')) return manifestPath;
      try {
        if (manifestPath.startsWith('http')) {
          const domainMatch = manifestPath.match(/https?:\/\/([^\/]+)(\/.*)/);
          return domainMatch ? domainMatch[2] : manifestPath;
        }
        return manifestPath;
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
  
  logger.log('Phase 5: Combined manifests:', persManifests.length);
  return persManifests;
};

// Main personalization initialization function
export async function init(enablements: any = {}, request: any, config: any) {
  logger.log('Phase 5: Initializing personalization with enablements:', enablements);
  
  let manifests: any[] = [];
  const {
    mepParam, mepHighlight, mepButton, pzn, pznroc, promo, enablePersV2,
    target, ajo, countryIPPromise, mepgeolocation, targetInteractionPromise, calculatedTimeout,
    postLCP,
  } = enablements;
  
  if (postLCP) {
    isPostLCP = true;
    logger.log('Phase 5: Post-LCP mode enabled');
  } else {
    logger.log('Phase 5: Pre-LCP mode - processing manifests');
    
    // Parse MEP parameter
    const variantOverride = parseMepParam(mepParam);
    
    // Combine MEP sources
    manifests = manifests.concat(await combineMepSources(pzn, pznroc, promo, mepParam, request));
    
    // Preload manifest URLs
    manifests?.forEach((manifest) => {
      if (manifest.disabled) return;
      logger.log('Phase 5: Preloading manifest:', manifest.manifestPath);
    });
  }

  // Handle Target/AJO integration (simplified for server-side)
  if (target === true || ajo === true) {
    logger.log('Phase 5: Processing Target/AJO manifests');
    // Server-side: simplified Target integration
  }
  
  if (postLCP) {
    logger.log('Phase 5: Post-LCP processing');
    // Server-side: simplified post-LCP handling
  }
  
  try {
    if (manifests?.length) {
      logger.log('Phase 5: Applying personalization to manifests');
      const result = await applyPers({ manifests }, request, config);
      logger.log('Phase 5: Personalization applied successfully:', result);
      return result;
    }
  } catch (e) {
    logger.log(`Phase 5: MEP Error: ${e.toString()}`);
  }
  
  return null;
}

// Enhanced getPersonalizationData function that integrates manifest processing
export async function getPersonalizationDataWithManifests(request: any, authState: any) {
  logger.log('Phase 5: Getting personalization data with manifest processing');
  
  try {
    // First, get raw data from Adobe Target
    const rawData = await fetchPersonalizationData(request, authState);
    const parsedData = parseRawData(rawData);
    
    // Extract manifest information from Target response
    const manifests = extractManifestsFromTargetResponse(rawData);
    
    if (manifests.length > 0) {
      logger.log('Phase 5: Found manifests in Target response:', manifests.length);
      
      // Extract enablements from request parameters and metadata
      const enablements = extractEnablements(request);
      logger.log('Phase 5: Extracted enablements:', enablements);
      
      // Create config with proper mep initialization
      const config = createConfigWithMep(request, enablements);
      
      // Initialize personalization with manifests
      const manifestResult = await init(enablements, request, config);
      
      if (manifestResult) {
        // Merge manifest-based personalization with Target-based personalization
        const mergedData = mergePersonalizationData(parsedData, manifestResult);
        logger.log('Phase 5: Merged personalization data:', mergedData);
        return mergedData;
      }
    }
    
    // Fallback to original Target-based personalization
    logger.log('Phase 5: Using Target-based personalization only');
    return parsedData;
    
  } catch (error) {
    logger.log('Phase 5: Error in manifest-enhanced personalization:', error);
    // Fallback to basic personalization
    return await getPersonalizationData(request, authState);
  }
}

// Function to extract enablements from request using getMepEnablement for consistency
function extractEnablements(request: any) {
  logger.log('Phase 5: Extracting enablements using getMepEnablement for consistency');
  
  // Extract from URL parameters with proper error handling
  let mepParam = null;
  let mepHighlight = null;
  let mepButton = null;
  let martech = null;
  
  const queryParams = getQueryParams(request.query);
  if (queryParams && queryParams.searchParams && queryParams.searchParams.get) {
    mepParam = queryParams.searchParams.get('mep');
    mepHighlight = queryParams.searchParams.get('mepHighlight');
    mepButton = queryParams.searchParams.get('mepButton');
    martech = queryParams.searchParams.get('martech');
  } else {
    // Fallback: manual query parameter parsing
    const queryString = request.query || '';
    if (queryString) {
      const params = new Map();
      queryString.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          params.set(key, decodeURIComponent(value));
        }
      });
      mepParam = params.get('mep');
      mepHighlight = params.get('mepHighlight');
      mepButton = params.get('mepButton');
      martech = params.get('martech');
    }
  }
  
  // Extract from metadata using getMepEnablement for consistency
  const pzn = getMepEnablement('personalization', false, request);
  const pznroc = getMepEnablement('personalization-roc', false, request);
  const promo = getMepEnablement('manifestnames', PROMO_PARAM, request);
  const target = martech === 'off' ? false : getMepEnablement('target', false, request);
  const ajo = martech === 'off' ? false : getMepEnablement('ajo', false, request);
  const mepgeolocation = getMepEnablement('mepgeolocation', false, request);
  const enablePersV2 = getMepEnablement('personalization-v2', false, request);
  
  logger.log('Phase 5: Extracted enablements using getMepEnablement:', {
    mepParam,
    mepHighlight,
    mepButton,
    martech,
    pzn,
    pznroc,
    promo,
    target,
    ajo,
    mepgeolocation,
    enablePersV2
  });
  
  return {
    mepParam,
    mepHighlight,
    mepButton,
    pzn,
    pznroc,
    promo,
    target,
    ajo,
    mepgeolocation,
    enablePersV2,
    postLCP: false,
  };
}

// Function to get metadata value from headers
function getMetadataValue(headers: any, key: string): string | null {
  const metaKey = `x-metadata-${key}`;
  return headers[metaKey]?.[0] || null;
}

// Function to extract metadata from HTML content
function extractMetadataFromHTML(htmlContent: string, key: string): string | null {
  // Create a regex to find meta tags with the given name
  const metaRegex = new RegExp(`<meta\\s+name=["']${key}["']\\s+content=["']([^"']*)["']`, 'i');
  const match = htmlContent.match(metaRegex);
  return match ? match[1] : null;
}

// Function to extract all metadata from HTML content
function extractAllMetadataFromHTML(htmlContent: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  
  // Find all meta tags with name attribute
  const metaRegex = /<meta\s+name=["']([^"']*)["']\s+content=["']([^"']*)["']/gi;
  let match;
  
  while ((match = metaRegex.exec(htmlContent)) !== null) {
    const [, name, content] = match;
    metadata[name] = content;
  }
  
  return metadata;
}

// Constants for MEP enablement
const PROMO_PARAM = 'promo';

// Function to get MEP value (converts string values to appropriate types)
function getMepValue(val: string | null): any {
  if (!val) return false;
  
  const valMap: Record<string, any> = { 
    on: true, 
    off: false, 
    postLCP: 'postlcp' 
  };
  const finalVal = val.toLowerCase().trim();
  if (finalVal in valMap) return valMap[finalVal];
  return finalVal;
}

// Function to get metadata value (server-side adaptation)
function getMdValue(key: string, request: any): any {
  const value = getMetadataValue(request.getHeaders(), key);
  if (value) {
    return getMepValue(value);
  }
  return false;
}

// Function to get promo MEP enablement (server-side adaptation)
function getPromoMepEnablement(request: any): any {
  const mds = [
    'apac_manifestnames',
    'emea_manifestnames',
    'americas_manifestnames',
    'jp_manifestnames',
    'manifestnames',
  ];
  
  const mdObject: Record<string, any> = {};
  
  mds.forEach((key) => {
    const val = getMdValue(key, request);
    if (val) {
      mdObject[key] = val;
    }
  });
  
  if (Object.keys(mdObject).length > 0) {
    return mdObject;
  }
  return false;
}

// Function to get MEP enablement (server-side adaptation)
export function getMepEnablement(mdKey: string, paramKey: string | false = false, request: any): any {
  // Get query parameters
  const queryParams = getQueryParams(request.query);
  let paramValue = null;
  
  if (queryParams && queryParams.searchParams && queryParams.searchParams.get) {
    paramValue = queryParams.searchParams.get(paramKey || mdKey);
  } else {
    // Fallback: manual query parameter parsing
    const queryString = request.query || '';
    if (queryString) {
      const params = new Map();
      queryString.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          params.set(key, decodeURIComponent(value));
        }
      });
      paramValue = params.get(paramKey || mdKey);
    }
  }
  
  if (paramValue) return getMepValue(paramValue);
  if (PROMO_PARAM === paramKey) return getPromoMepEnablement(request);
  return getMdValue(mdKey, request);
}

// Function to create config with proper mep initialization
function createConfigWithMep(request: any, enablements: any) {
  const { mepParam, mepButton, target, ajo, enablePersV2, mepgeolocation } = enablements;
  
  // Get locale from request path
  const path = request.path;
  const pathParts = path.split('/');
  const localeCode = pathParts[1] || 'us';
  
  const config = {
    mep: {
      variantOverride: parseMepParam(mepParam),
      highlight: (enablements.mepHighlight !== undefined && enablements.mepHighlight !== 'false'),
      targetEnabled: target,
      ajoEnabled: ajo,
      experiments: [],
      prefix: localeCode,
      enablePersV2,
      geoLocation: mepgeolocation,
      preview: (mepButton !== 'off' && mepParam !== undefined),
    },
    locale: {
      ietf: `${localeCode}-${localeCode.toUpperCase()}`,
      region: localeCode,
      prefix: `/${localeCode}`,
    },
    placeholders: {},
  };
  
  return config;
}

// Function to extract manifests from Target response
function extractManifestsFromTargetResponse(targetData: any) {
  logger.log('Phase 5: Extracting manifests from Target response');
  
  const manifests: any[] = [];
  
  // Extract manifest information from Target propositions
  const propositions = targetData?.handle?.find((d: any) => d.type === "personalization:decisions")?.payload || [];
  
  propositions.forEach((proposition: any) => {
    proposition.items?.forEach((item: any) => {
      if (item.data?.format === "application/json") {
        const content = item.data.content;
        if (content?.manifestLocation || content?.manifestPath) {
          manifests.push({
            manifestPath: content.manifestLocation || content.manifestPath,
            manifestUrl: content.manifestLocation,
            manifestData: content.manifestContent?.experiences?.data || content.manifestContent?.data,
            manifestPlaceholders: content.manifestContent?.placeholders?.data,
            manifestInfo: content.manifestContent?.info?.data,
            name: item.meta?.['activity.name'] || item.id,
            variantLabel: (item.meta?.['experience.name'] && `target-${item.meta['experience.name']}`)
              || content.experienceName,
            meta: item.meta,
          });
        }
      }
    });
  });
  
  logger.log('Phase 5: Extracted manifests:', manifests.length);
  return manifests;
}

// Function to merge personalization data from different sources
function mergePersonalizationData(targetData: any, manifestData: any) {
  logger.log('Phase 5: Merging personalization data');
  
  const merged = {
    fragments: [...(targetData.fragments || []), ...(manifestData.fragments || [])],
    commands: [...(targetData.commands || []), ...(manifestData.commands || [])],
  };
  
  logger.log('Phase 5: Merged data:', {
    targetFragments: targetData.fragments?.length || 0,
    manifestFragments: manifestData.fragments?.length || 0,
    totalFragments: merged.fragments.length,
    targetCommands: targetData.commands?.length || 0,
    manifestCommands: manifestData.commands?.length || 0,
    totalCommands: merged.commands.length,
  });
  
  return merged;
}

// Phase 6: Additional Utility Functions

// Function to build variant info
export function buildVariantInfo(variantNames: string[]) {
  return variantNames.reduce((acc: any, name: string) => {
    let nameArr = [name];
    if (!name.startsWith(TARGET_EXP_PREFIX)) {
      nameArr = name.split(/,(?![^(]*\))/);
    }
    acc[name] = nameArr.map((v: string) => v.trim()).filter(Boolean);
    acc.allNames = [...acc.allNames, ...nameArr.map((v: string) => v.trim()).filter(Boolean)];
    return acc;
  }, { allNames: [] });
}

// Function to check for parameter match
const checkForParamMatch = (paramStr: string, request: any) => {
  const [name, val] = paramStr.split('param-')[1].split('=');
  if (!name) return false;
  
  const queryParams = getQueryParams(request.query);
  const searchParamVal = queryParams.get(name.toLowerCase());
  if (searchParamVal !== null) {
    if (val) return val === searchParamVal;
    return true; // if no val is set, just check for existence of param
  }
  return false;
};

// Function to check for previous page match
export const checkForPreviousPageMatch = (previousPageStr: string, referer: string) => {
  if (!referer) return false;
  const previousPageString = previousPageStr.toLowerCase().split('previouspage-')[1];
  try {
    const refererUrl = new URL(referer);
    return matchGlob(previousPageString, refererUrl.pathname);
  } catch (e) {
    return false;
  }
};

// Function to normalize country
function normCountry(country: string) {
  return (country.toLowerCase() === 'uk' ? 'gb' : country.toLowerCase()).split('_')[0];
}

// Function to set MEP country
async function setMepCountry(config: any, request: any) {
  const queryParams = getQueryParams(request.query);
  const country = queryParams.get('country');
  const akamaiCode = queryParams.get('akamaiLocale')?.toLowerCase();
  
  config.mep = config.mep || {};
  if (country) {
    config.mep.countryChoice = normCountry(country);
  }
  if (akamaiCode) {
    config.mep.countryIP = normCountry(akamaiCode);
  }
  if (!config.mep.countryChoice && config.mep.countryIP) {
    config.mep.countryChoice = config.mep.countryIP;
  }
}

// Function to check for country match
function hasCountryMatch(str: string, config: any) {
  if (str.includes('countrychoice') || str.includes('countryip')) {
    const modifiedStr = str.replace('uk', 'gb');
    return matchesCountryChoiceOrIP(modifiedStr, config);
  }
  return false;
}

// Function to check if matches country choice or IP
const matchesCountryChoiceOrIP = (name: string, config: any) => {
  if (!name.includes('countrychoice') && !name.includes('countryip')) return false;
  const countryList = name.match(/\(([^)]+)\)/)?.[1]?.split(',').map((c: string) => c.trim());
  if (!countryList?.length) return false;
  const { countryChoice, countryIP } = config.mep;
  const testCountry = name.includes('countrychoice') ? countryChoice : countryIP;
  return countryList.includes(testCountry);
};

// Function to parse placeholders
export function parsePlaceholders(placeholders: any[], config: any, selectedVariantName: string = '') {
  if (!placeholders?.length || selectedVariantName === 'default') return config;
  
  const { countryIP, countryChoice } = config.mep || {};
  const valueNames = [
    selectedVariantName.toLowerCase(),
    config.mep?.prefix,
    config.locale?.region?.toLowerCase(),
    ...(countryIP ? [`countryip(${countryIP})`] : []),
    ...(countryChoice ? [`countrychoice(${countryChoice})`] : []),
    config.locale?.ietf?.toLowerCase(),
    ...(config.locale?.ietf?.toLowerCase().split('-') || []),
    'value',
    'other',
  ];
  
  const keys = placeholders?.length ? Object.entries(placeholders[0]) : [];
  const keyVal = keys.find(([key]) => {
    const modifiedStr = key.toLowerCase();
    return valueNames.includes(modifiedStr) || hasCountryMatch(modifiedStr, config);
  });
  const key = keyVal?.[0];

  if (key) {
    const results = placeholders.reduce((res: any, item: any) => {
      res[item.key] = item[key];
      return res;
    }, {});
    config.placeholders = { ...(config.placeholders || {}), ...results };
  }

  return config;
}

// Function to get entitlement map
export const getEntitlementMap = async () => {
  // Simplified for server-side - return empty object for now
  return {};
};

// Function to get entitlements
export const getEntitlements = async (data: any[]) => {
  const entitlementMap = await getEntitlementMap();
  return data.flatMap((destination: any) => {
    const ents = destination.segments?.flatMap((segment: any) => {
      const entMatch = entitlementMap[segment.id];
      return entMatch ? [entMatch] : [];
    });
    return ents || [];
  });
};






