import { determineLocale } from "../Utilities/Utilities";
import { httpRequest } from "http-request";
import { logger } from "log";

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

// Helper function to normalize path
function normalizePath(path) {
  return path?.replace(/^\/+/, "/") || "/";
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
