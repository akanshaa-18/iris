import { determineLocale } from "../Utilities/Utilities";
import { httpRequest } from "http-request";
import { logger } from "log";
import { loadManifests, getAllManifests, getManifestSummary } from "./ManifestLoader";
import { 
  Manifest, 
  parseManifestConfig, 
  parseManifestVariants, 
  getPersonalizationVariant,
  matchGlob 
} from "./ManifestParser";
import { normalizePath, replacePlaceholders, getFileName } from "./ManifestUtils";

export type ProcessedData = { 
  fragments?: Array<{ selector: string; val: string; action: string; manifestId?: string; targetManifestId?: string }>;
  commands?: Array<{ action: string; selector: string; content: string; manifestId?: string; targetManifestId?: string; modifiers?: string[]; attribute?: string }>;
  placeholders?: Record<string, string>;
};

// Constants
const AMCV_COOKIE = 'AMCV_9E1005A551ED61CA0A490D45@AdobeOrg';
const REPORT_SUITES_ID = 'adobecom,adobecomdev';
const AT_PROPERTY_VAL = 'bc8dfa27-29cc-625c-22ea-f7ccebfc6231';

// Helper function to determine selector type
function getSelectorType(selector: string): string {
  const sel = selector?.toLowerCase().trim();
  if (sel?.startsWith("/") || sel?.startsWith("http")) return "fragment";
  return "other";
}

// Helper function to get Target property based on page region
function getTargetPropertyBasedOnPageRegion({ env, pathname }: { env: string; pathname: string }): string {
  // Default property value
  const defaultProperty = 'bc8dfa27-29cc-625c-22ea-f7ccebfc6231';
  
  // Check if pathname contains region-specific patterns
  if (pathname.includes('/jp/') || pathname.includes('/kr/')) {
    return env === 'prod' ? 'jp-prod-property-id' : 'jp-stage-property-id';
  }
  
  if (pathname.includes('/eu/') || pathname.includes('/uk/')) {
    return env === 'prod' ? 'eu-prod-property-id' : 'eu-stage-property-id';
  }
  
  // Return default property for US/global
  return defaultProperty;
}

// Helper function to get or generate user ID from cookies
// function getOrGenerateUserId(cookies: Record<string, string>): any {
//   // Check for existing user ID in cookies
//   const amcvCookie = cookies[AMCV_COOKIE];
//   const kndctrCookie = cookies['kndctr_9E1005A551ED61CA0A490D45_AdobeOrg_identity'];
  
//   if (amcvCookie) {
//     return {
//       "AMCV_9E1005A551ED61CA0A490D45@AdobeOrg": [{
//         "id": amcvCookie,
//         "authenticatedState": "authenticated",
//         "primary": true
//       }]
//     };
//   }
  
//   if (kndctrCookie) {
//     return {
//       "kndctr_9E1005A551ED61CA0A490D45_AdobeOrg_identity": [{
//         "id": kndctrCookie,
//         "authenticatedState": "authenticated",
//         "primary": true
//       }]
//     };
//   }
  
//   // Generate a temporary anonymous ID if no existing ID found
//   const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
//   return {
//     "anonymous": [{
//       "id": tempId,
//       "authenticatedState": "ambiguous",
//       "primary": true
//     }]
//   };
// }

// Process Adobe Alloy/Target response (mirrors client-side handleAlloyResponse exactly)
function handleAlloyResponse(response: any): any[] {
  // Find the personalization:decisions from the handle array
  const personalizationDecisions = response?.handle?.find((h: any) => h.type === "personalization:decisions");
  
  if (!personalizationDecisions?.payload) {
    return [];
  }

  return personalizationDecisions.payload
    ?.map((i: any) => {
      const { id } = i;
      return i.items.map((item: any) => ({ ...item, id }));
    })
    ?.flat()
    ?.map((item: any) => {
      const content = item?.data?.content;
      if (!content || !(content.manifestLocation || content.manifestContent)) return null;
      return {
        manifestPath: content.manifestLocation || content.manifestPath,
        manifestUrl: content.manifestLocation,
        manifestData: content.manifestContent?.experiences?.data || content.manifestContent?.data,
        manifestPlaceholders: content.manifestContent?.placeholders?.data,
        manifestInfo: content.manifestContent?.info.data,
        name: item.meta?.['activity.name'] || item.id,
        variantLabel: (item.meta?.['experience.name'] && `target-${item.meta['experience.name']}`)
          || content.experienceName,
        meta: item.meta,
      };
    })
    ?.filter(Boolean) ?? [];
}

// Fetch main page placeholders (like client-side decoratePlaceholders)
async function fetchMainPagePlaceholders(request: any, locale: any): Promise<Record<string, string>> {
  try {
    // Build contentRoot like client-side (from config.locale.contentRoot)
    const hostname = request.host || 'www.adobe.com';
    const env = request.host?.includes('stage') || request.host?.includes('dev') ? 'stage' : 'prod';
    const origin = `https://${hostname}`;
    const contentRoot = `${origin}${locale.prefix}`;
    
    // Build placeholder paths (like client-side getPlaceholdersPath)
    const root = `${contentRoot}/cc-shared/placeholders`;
    const paths = [`${root}.json`];
    
    // if (env !== 'prod') {
    //   // Check if placeholders-stage is enabled (like client-side)
    //   // For now, we'll always include stage placeholders in non-prod
    //   paths.push(`${root}-stage.json`);
    // }
    
    // logger.log(`🔍 Fetching main page placeholders from paths: ${JSON.stringify(paths)}`);
    
    // Parse placeholder JSON (like client-side parsePlaceholderJson)
    const parsePlaceholderJson = async (resp: any, placeholders: Record<string, string>) => {
      try {
        const json = resp.ok ? await resp.json() : { data: [] };
        json.data?.forEach((item: any) => {
          placeholders[item.key] = item.value;
        });
        // logger.log(`✅ Parsed placeholders: ${JSON.stringify(placeholders)}`);
      } catch (e) {
        logger.log(`❌ Error parsing placeholder json: ${e}`);
      }
    };
    
    // Fetch placeholder (like client-side fetchPlaceholder)
    const fetchPlaceholder = async (path: string): Promise<Record<string, string>> => {
      try {
        const response = await httpRequest(path, {
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'max-age=300'
          }
        });
        
        const placeholders: Record<string, string> = {};
        await parsePlaceholderJson(response, placeholders);
        return placeholders;
      } catch (error) {
        logger.log(`❌ Error fetching placeholders from ${path}: ${error}`);
        return {};
      }
    };
    
    // Fetch all placeholder files
    const placeholderPromises = paths.map(path => fetchPlaceholder(path));
    const placeholderResults = await Promise.all(placeholderPromises);
    
    // Merge all placeholder results (like client-side)
    const mergedPlaceholders: Record<string, string> = {};
    placeholderResults.forEach(result => {
      if (result && typeof result === 'object') {
        Object.assign(mergedPlaceholders, result);
      }
    });
    
    // Add fallback for missing placeholders (like client-side keyToStr)
    const keyToStr = (key: string) => key.replaceAll('-', ' ');
    
    // For any placeholders that weren't found, use keyToStr as fallback
    // This matches the client-side behavior exactly
    // logger.log(`🔍 Final merged placeholders: ${JSON.stringify(mergedPlaceholders)}`);
    return mergedPlaceholders;
    
  } catch (error) {
    logger.log(`❌ Error in fetchMainPagePlaceholders: ${error}`);
    return {};
  }
}

export async function getPersonalizationData(request: any, authState: any, htmlContent: string): Promise<ProcessedData> {
  const startTime = Date.now();
  // logger.log("Starting unified manifest-based personalization data processing");
  
  try {
    // Load all RAW MANIFEST SOURCES (like client-side combineMepSources + handleAlloyResponse)
    const manifestSources = await getAllManifests(htmlContent, request, authState);
    
    // logger.log(`📋 Total manifest sources found: ${manifestSources.length}`);
    manifestSources.forEach((source, index) => {
      // logger.log(`📋 Source ${index + 1}: ${source.manifestPath} (${source.source?.join(', ')})`);
    });
    
    if (!manifestSources.length) {
      logger.log("No manifest sources found for personalization");
      return { fragments: [], commands: [], placeholders: {} };
    }
    
    // logger.log(`Found ${manifestSources.length} manifest sources to process`);
    
    // PROCESS ALL MANIFESTS TOGETHER (like client-side applyPers)
    let experiments = manifestSources;
    
    // Determine locale for placeholder processing
    const locale = determineLocale(request);
    
    // Determine environment (like personalization.js)
    const env = request.host?.includes('stage') || request.host?.includes('dev') ? 'stage' : 'prod';
    
    // Fetch main page placeholders (like client-side decoratePlaceholders)
    const mainPagePlaceholders = await fetchMainPagePlaceholders(request, locale);
    
    const config = { 
      mep: { 
        experiments: [], 
        blocks: [], 
        fragments: [], 
        commands: [],
        prefix: locale.prefix?.split('/')[1]?.toLowerCase() || 'us'
      },
      // placeholders: mainPagePlaceholders,// Start with main page placeholders
      placeholders: [], 
      locale: locale,
      env: { name: env }
    };
    
    // Process each manifest source (like client-side getManifestConfig)
    for (let i = 0; i < experiments.length; i += 1) {
      const manifestSource = experiments[i];
      // logger.log(`🔍 Processing manifest ${i + 1}/${experiments.length}: ${manifestSource.manifestPath}`);
      
      // Get manifest config (like client-side getManifestConfig)
      const experiment = await getManifestConfig(manifestSource, false, request);
      if (experiment) {
        // logger.log(`✅ Manifest processed successfully: ${manifestSource.manifestPath}`);
        experiments[i] = experiment;
      } else {
        logger.log(`❌ Failed to process manifest: ${manifestSource.manifestPath}`);
        experiments[i] = null;
      }
    }
    // logger.log(`Experiments: ${JSON.stringify(experiments)}`);
    
    // Clean and sort manifest list (like client-side cleanAndSortManifestList)
    // logger.log(`About to process ${experiments.length} experiments through cleanAndSortManifestList`);
    // logger.log(`First experiment structure: ${JSON.stringify(experiments[0])}`);
    experiments = cleanAndSortManifestList(experiments, config);
    
    // logger.log(`🏆 After sorting/cleaning - ${experiments.length} manifests remain:`);
    experiments.forEach((exp, index) => {
      // logger.log(`🏆 ${index + 1}. ${exp.manifestPath} (priority: ${exp.priority || 'N/A'}, executionOrder: ${exp.executionOrder || 'N/A'})`);
    });
    
    if (experiments.length > 0) {
      // logger.log(`🏆 WINNER: ${experiments[0].manifestPath} will take over the marquee`);
    }
    
    // Parse nested placeholders (like client-side parseNestedPlaceholders)
    parseNestedPlaceholders(config);
    // logger.log(`Placeholders: ${JSON.stringify(config.placeholders)}`);
    // logger.log(`Processed ${experiments.length} experiments, sorted by execution order`);
    
    // Categorize actions (like client-side categorizeActions)
    let results = [];
    for (const experiment of experiments) {
      // Debug: Check experiment structure
      // if (experiment.manifestPath && experiment.manifestPath.includes('target-')) {
      //   logger.log(`Processing target variant experiment:`, JSON.stringify({
      //     manifestPath: experiment.manifestPath,
      //     selectedVariantName: experiment.selectedVariantName,
      //     hasSelectedVariant: !!experiment.selectedVariant,
      //     selectedVariantType: typeof experiment.selectedVariant
      //   }));
      // }
      
      const result = await categorizeActions(experiment, config);
      
      // // Debug: Check what categorizeActions returns for target variants
      // if (experiment.manifestPath && experiment.manifestPath.includes('target-')) {
      //   logger.log(`categorizeActions result for target variant:`, JSON.stringify(result));
      // }
      
      if (result) results.push(result);
    }
    results = results.filter(Boolean);
    // logger.log(`Results: ${JSON.stringify(results)}`);
    
    // Store experiments (like client-side)
    config.mep.experiments = [...config.mep.experiments, ...experiments];
    // logger.log(`Experiments: ${JSON.stringify(config.mep.experiments)}`);
    
    // Consolidate all actions (like client-side consolidateObjects and consolidateArray)
    config.mep.blocks = consolidateObjects(results, 'blocks', config.mep.blocks);
    config.mep.fragments = consolidateObjects(results, 'fragments', config.mep.fragments);
    // logger.log(`Fragments: ${JSON.stringify(config.mep.fragments)}`);
    
    // Debug: Check what's in results before consolidation
    // logger.log(`Results before consolidation:`, JSON.stringify(results.map(r => ({ 
    //   hasCommands: !!r.commands, 
    //   commandCount: r.commands?.length || 0,
    //   commands: r.commands?.map(c => ({ 
    //     targetManifestId: c.targetManifestId,
    //   }))
    // }))));
    
    config.mep.commands = consolidateArray(results, 'commands', config.mep.commands);
    // Handle commands (like client-side handleCommands) - this processes both commands AND fragments together
    // config.mep.commands = handleCommands(config.mep.commands, config);
    // logger.log(`config.mep.commands:`, JSON.stringify(config.mep.commands));
    
    const endTime = Date.now();
    // logger.log(`Unified personalization data processing completed in ${endTime - startTime}ms`);
    // logger.log(`Found ${config.mep.fragments.length} fragments and ${config.mep.commands.length} commands`);
    
    // logger.log(`Final placeholders being returned: ${JSON.stringify(config.placeholders)}`);
    
    return {
      fragments: config.mep.fragments,
      commands: config.mep.commands,
      placeholders: config.placeholders || {}
    };
  } catch (error) {
    const endTime = Date.now();
    logger.log(`Personalization data processing failed after ${endTime - startTime}ms: ${error}`);
    throw error;
  }
}

// Check page filter against actual request path
function checkPageFilter(pageFilter: string, request: any): boolean {
  if (!pageFilter) return true;
  
  // Get the actual path from request
  const requestPath = request.path || '/';
  
  // Simple path matching (can be enhanced with glob patterns)
  return requestPath.includes(pageFilter) || pageFilter.includes(requestPath);
}

// KEEPING YOUR COMPLETE TARGET API REQUEST BODY
async function fetchPersonalizationData(request: any, authState: any) {
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
      get: (param: string) => {
        if (!query) return null;
        
        // Manual URLSearchParams implementation for Akamai EdgeWorkers
        const params: Record<string, string> = {};
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

// function getTargetPropertyBasedOnPageRegion({ env, pathname }) {
//   if (env !== 'prod') return 'bc8dfa27-29cc-625c-22ea-f7ccebfc6231';

//   // EMEA & LATAM
//   if (
//     pathname.search(
//       /(\/africa\/|\/be_en\/|\/be_fr\/|\/be_nl\/|\/cis_en\/|\/cy_en\/|\/dk\/|\/de\/|\/ee\/|\/es\/|\/fr\/|\/gr_en\/|\/ie\/|\/il_en\/|\/it\/|\/lv\/|\/lu_de\/|\/lu_en\/|\/lu_fr\/|\/hu\/|\/mt\/|\/mena_en\/|\/nl\/|\/no\/|\/pl\/|\/pt\/|\/ro\/|\/ch_de\/|\/si\/|\/sk\/|\/ch_fr\/|\/fi\/|\/se\/|\/ch_it\/|\/tr\/|\/uk\/|\/at\/|\/cz\/|\/bg\/|\/ru\/|\/cis_ru\/|\/ua\/|\/il_he\/|\/mena_ar\/|\/lt\/|\/sa_en\/|\/ae_en\/|\/ae_ar\/|\/sa_ar\/|\/ng\/|\/za\/|\/qa_ar\/|\/eg_en\/|\/eg_ar\/|\/kw_ar\/|\/eg_ar\/|\/qa_en\/|\/kw_en\/|\/gr_el\/|\/br\/|\/cl\/|\/la\/|\/mx\/|\/co\/|\/ar\/|\/pe\/|\/gt\/|\/pr\/|\/ec\/|\/cr\/)/,
//     ) !== -1
//   ) {
//     return '488edf5f-3cbe-f410-0953-8c0c5c323772';
//   }
  
//   // APAC
//   if (
//     pathname.search(
//       /(\/au\/|\/hk_en\/|\/in\/|\/nz\/|\/sea\/|\/cn\/|\/hk_zh\/|\/tw\/|\/kr\/|\/sg\/|\/th_en\/|\/th_th\/|\/my_en\/|\/my_ms\/|\/ph_en\/|\/ph_fil\/|\/vn_en\/|\/vn_vi\/|\/in_hi\/|\/id_id\/|\/id_en\/)/,
//     ) !== -1
//   ) {
//     return '3de509ee-bbc7-58a3-0851-600d1c2e2918';
//   }
  
//   // JP
//   if (pathname.indexOf('/jp/') !== -1) {
//     return 'ba5bc9e8-8fb4-037a-12c8-682384720007';
//   }

//   return '4db35ee5-63ad-59f6-cec6-82ef8863b22d'; // Default
// }

function getOrGenerateUserId(cookies: Record<string, string>): any {
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

function parseRawData(targetData: any): ProcessedData {
  // Extract personalization decisions
  const propositions = targetData?.handle?.find((d: any) => d.type === "personalization:decisions")?.payload || [];

  if (propositions.length === 0) {
    return { fragments: [], commands: [], placeholders: {} };
  }

  logger.log(`Found ${propositions.length} propositions`);

  // Process propositions to extract fragments and commands
  const fragments: ProcessedData['fragments'] = [];
  const commands: ProcessedData['commands'] = [];
  const placeholders: Record<string, string> = {};

  propositions.forEach((proposition: any) => {
    proposition.items?.forEach((item: any) => {
      if (item.data?.format === "application/json") {
        const content = item.data.content;
        if (content?.manifestContent) {
          const experiences = content.manifestContent?.experiences?.data || content.manifestContent?.data || [];

          experiences.forEach((experience: any) => {
            const action = experience.action
              ?.toLowerCase()
              .replace("content", "")
              .replace("fragment", "")
              .replace("tosection", "");

            const selector = experience.selector;
            const variantNames = Object.keys(experience).filter(
              (key: string) => !["action", "selector", "pagefilter", "page filter", "page filter optional"].includes(
                key.toLowerCase()
              )
            );

            variantNames.forEach((variant: string) => {
              if (!experience[variant] || experience[variant].toLowerCase() === "false") return;

              if (getSelectorType(selector) === "fragment") {
                fragments.push({
                  selector: normalizePath(selector.split(" #_")[0], true, request),
                  val: normalizePath(experience[variant], true, request),
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
  
  return { fragments, commands, placeholders };
}

export function getEntitlementCreativeCloud(profile: any, scope: string): string {
  if (
    scope
    && scope.indexOf('creative_cloud') !== -1
    && profile
    && profile.serviceAccounts
  ) {
    const serviceAccount = profile.serviceAccounts.find(
      (sa: any) => sa.serviceCode === 'creative_cloud',
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

export function getEntitlementStatusCreativeCloud(profile: any, scope: string): string {
  if (
    scope
    && scope.indexOf('creative_cloud') !== -1
    && profile
    && profile.serviceAccounts
  ) {
    const serviceAccount = profile.serviceAccounts.find(
      (sa: any) => sa.serviceCode === 'creative_cloud',
    );
    return serviceAccount?.serviceStatus || 'none';
  }
  return 'none';
}

// Export handleAlloyResponse and fetchPersonalizationData for use in ManifestLoader
export { handleAlloyResponse, fetchPersonalizationData };

// Consolidate objects (like client-side consolidateObjects)
function consolidateObjects(results: any[], key: string, existing: any[] = []): any[] {
  const consolidated = [...existing];
  
  results.forEach(result => {
    if (result[key]) {
      consolidated.push(...result[key]);
    }
  });
  
  return consolidated;
}

// Consolidate arrays (like client-side consolidateArray)
function consolidateArray(results: any[], key: string, existing: any[] = []): any[] {
  const consolidated = [...existing];
  
  results.forEach(result => {
    if (result[key]) {
      consolidated.push(...result[key]);
    }
  });
  
  return consolidated;
}

// Handle commands (like client-side handleCommands) - this processes both commands AND fragments together
function handleCommands(commands: any[], config: any): any[] {
  if (!commands?.length) return commands;
  
  // Like client-side, we need to process commands that may contain fragment content
  return commands.map(command => {
    const { action, content, selector } = command;
    
    // Check if this command has fragment content (like client-side createContent logic)
    const isFragmentContent = content && (content.startsWith('/') || content.startsWith('http'));
    
    if (isFragmentContent) {
      // Mark this command as having fragment content for server-side processing
      return { 
        ...command, 
        hasFragmentContent: true,
        processed: true 
      };
    }
    
    // Process command based on action type (like client-side)
    if (action === 'remove') {
      return { ...command, processed: true };
    }
    if (action === 'replace') {
      return { ...command, processed: true };
    }
    if (action === 'insertafter' || action === 'insertbefore') {
      return { ...command, processed: true };
    }
    if (action === 'prepend' || action === 'append') {
      return { ...command, processed: true };
    }
    if (action === 'updateAttribute') {
      return { ...command, processed: true };
    }
    return command;
  });
}

// Parse placeholders (like client-side parsePlaceholders)
function parsePlaceholders(placeholderData: any, config: any, variantName: string) {
  // logger.log(`parsePlaceholders called with: variantName=${variantName}, placeholderData=${JSON.stringify(placeholderData)}`);
  
  if (!placeholderData?.length || variantName === 'default') {
    // logger.log(`Skipping placeholder processing: no data or default variant`);
    return config;
  }
  
  // Get locale and MEP info from config (like client-side)
  const { countryIP, countryChoice } = config.mep || {};
  const locale = config.locale || {};
  
  // logger.log(`Locale info: ${JSON.stringify(locale)}`);
  
  // Build value names array (like client-side)
  const valueNames = [
    variantName.toLowerCase(),
    config.mep?.prefix,
    locale.region?.toLowerCase(),
    ...(countryIP ? [`countryip(${countryIP})`] : []),
    ...(countryChoice ? [`countrychoice(${countryChoice})`] : []),
    locale.ietf?.toLowerCase(),
    ...(locale.ietf?.toLowerCase().split('-') || []),
    'value',
    'other',
  ];
  
  // logger.log(`Value names array: ${JSON.stringify(valueNames)}`);
  
  // Find the matching key (like client-side)
  const keys = placeholderData?.length ? Object.entries(placeholderData[0]) : [];
  // logger.log(`Available keys: ${JSON.stringify(keys.map(([k]) => k))}`);
  
  const keyVal = keys.find(([key]) => {
    const modifiedStr = key.toLowerCase();
    return valueNames.includes(modifiedStr) || hasCountryMatch(modifiedStr, config);
  });
  const key = keyVal?.[0];

  // logger.log(`Selected key: ${key}`);

  if (key) {
    // Build results object (like client-side)
    const results = placeholderData.reduce((res: any, item: any) => {
      res[item.key] = item[key];
      return res;
    }, {});
    
    // logger.log(`Built results: ${JSON.stringify(results)}`);
    
    // Store in config (like client-side)
    config.placeholders = { ...(config.placeholders || {}), ...results };
    
    // logger.log(`Final config.placeholders: ${JSON.stringify(config.placeholders)}`);
    
    // Create martech metadata (like client-side)
    // createMartechMetadata(placeholderData, config, key);
  } else {
    logger.log(`No matching key found for placeholder processing`);
  }
  
  return config;
}

// Helper function for country matching (like client-side hasCountryMatch)
function hasCountryMatch(str: string, config: any): boolean {
  if (str.includes('countrychoice') || str.includes('countryip')) {
    const modifiedStr = str.replace('uk', 'gb');
    return matchesCountryChoiceOrIP(modifiedStr, config);
  }
  return false;
}

// Helper function for country choice/IP matching (like client-side matchesCountryChoiceOrIP)
function matchesCountryChoiceOrIP(name: string, config: any): boolean {
  if (!name.includes('countrychoice') && !name.includes('countryip')) return false;
  const countryList = name.match(/\(([^)]+)\)/)?.[1]?.split(',').map((c) => c.trim());
  if (!countryList?.length) return false;
  const { countryChoice, countryIP } = config.mep || {};
  const testCountry = name.includes('countrychoice') ? countryChoice : countryIP;
  return countryList.includes(testCountry);
}

// Create martech metadata (like client-side createMartechMetadata)
// function createMartechMetadata(placeholders: any, config: any, column: string) {
//   if (config.locale?.ietf === 'en-US') return;
  
//   // For server-side, we'll log the metadata creation but not implement the full client-side logic
//   // since it involves client-specific imports and window objects
//   logger.log(`🔍 Martech metadata creation for column: ${column}`);
//   logger.log(`🔍 Placeholders data: ${JSON.stringify(placeholders)}`);
  
//   // Initialize analyticLocalization if not exists (like client-side)
//   if (!config.mep) config.mep = {};
//   config.mep.analyticLocalization = config.mep.analyticLocalization || {};
  
//   // Process placeholders for analytics (simplified server-side version)
//   placeholders.forEach((item: any, i: number) => {
//     const firstRow = placeholders[i];
//     let usValue = firstRow['en-us'] || firstRow.us || firstRow.en || firstRow.key;
    
//     if (!usValue) return;
    
//     // For server-side, we'll store the mapping but not process tracking labels
//     const translatedValue = item[column];
//     if (translatedValue) {
//       config.mep.analyticLocalization[translatedValue] = usValue;
//     }
//   });

//   logger.log(`🔍 Analytic localization: ${JSON.stringify(config.mep.analyticLocalization)}`);
// }

// Set metadata function (like client-side setMetadata)
function setMetadata(metadata: any) {
  // For server-side, we might want to log or handle metadata differently
  logger.log(`Metadata to update: ${JSON.stringify(metadata)}`);
}

// Parse MEP parameter (like client-side parseMepParam)
function parseMepParam(mepParam: string) {
  if (!mepParam) return false;
  const mepObject = Object.create(null);
  const decodedParam = decodeURIComponent(mepParam);
  decodedParam.split('---').forEach((item) => {
    const pair = item.trim().split('--');
    if (pair.length > 1) {
      const [manifestPath, selectedVariant] = pair;
      mepObject[manifestPath] = selectedVariant;
    }
  });
  return mepObject;
}

// Compare execution order (like client-side compareExecutionOrder)
function compareExecutionOrder(a: any, b: any): number {
  if (a.executionOrder === b.executionOrder) return 0;
  return a.executionOrder > b.executionOrder ? 1 : -1;
}

// Normalize fragment paths (like client-side normalizeFragPaths)
function normalizeFragPaths({ selector, val, action, manifestId, manifestPath, targetManifestId }: any) {
  return {
    selector: normalizePath(selector),
    val: normalizePath(val),
    action,
    manifestId,
    manifestPath,
    targetManifestId,
  };
}

// Categorize actions (like client-side categorizeActions)
async function categorizeActions(experiment: any, config: any): Promise<any> {
  if (!experiment) return null;
  
  const { manifestPath, selectedVariant } = experiment;
  
  // Debug: Check if this is a target variant experiment
  if (manifestPath && manifestPath.includes('target-')) {
    logger.log(`categorizeActions: Processing target variant experiment for ${manifestPath}`);
    logger.log(`categorizeActions: selectedVariant:`, JSON.stringify(selectedVariant));
    logger.log(`categorizeActions: selectedVariant.commands:`, JSON.stringify(selectedVariant?.commands));
  }
  
  if (!selectedVariant || selectedVariant === 'default') return { experiment };

  // Handle replacepage (like client-side)
  const { replacepage } = selectedVariant;
  if (selectedVariant.replacepage?.length) {
    config.mep.replacepage = replacepage[0];
  }

  // Handle insertscript (like client-side)
  selectedVariant.insertscript?.map((script: any) => {
    logger.log(`Script to load: ${script.val}`);
  });

  // Handle updatemetadata (like client-side)
  selectedVariant.updatemetadata?.map((metadata: any) => setMetadata(metadata));

  // Normalize fragment paths (like client-side)
  selectedVariant.fragments &&= selectedVariant.fragments.map(normalizeFragPaths);

  return {
    manifestPath,
    experiment,
    blocks: selectedVariant.useblockcode,
    fragments: selectedVariant.fragments,
    commands: selectedVariant.commands,
  };
}

// Get manifest config (exactly like client-side getManifestConfig)
async function getManifestConfig(info: any = {}, variantOverride: boolean = false, request?: any): Promise<any> {
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
  
  // Check disabled condition (exactly like client-side)
  if (disabled && (!variantOverride || !Object.keys(variantOverride || {}).length)) {
    return createDefaultExperiment(info);
  }
  
  let data = manifestData;
  if (!data) {
    const fetchedData = await fetchManifestData(manifestPath, request);
    if (fetchedData) data = fetchedData;
  }

  const persData = data?.experiences?.data || data?.data || data;
  if (!persData) return null;
  
  const infoTab = manifestInfo || data?.info?.data;
  const infoObj = infoTab?.reduce((acc: any, item: any) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
  
  const manifestOverrideName = infoObj?.['manifest-override-name']?.toLowerCase();
  const targetId = name || manifestOverrideName;
  const manifestConfig = parseManifestVariants(persData, manifestPath, targetId, request);

  if (!manifestConfig) {
    logger.log('Error loading personalization manifestConfig: ', name || manifestPath);
    return null;
  }
  
  const infoKeyMap = {
    'manifest-type': ['Personalization', 'Promo', 'Test'],
    'manifest-execution-order': ['First', 'Normal', 'Last'],
  };
  
  if (infoTab) {
    manifestConfig.manifestType = infoObj?.['manifest-type']?.toLowerCase();
    if (manifestConfig.manifestType === 'personalization') {
      manifestConfig.manifestOverrideName = manifestOverrideName;
      const analytics = manifestOverrideName || getFileName(manifestPath).replace('.json', '');
      manifestConfig.analyticsTitle = analytics.trim().slice(0, 15);
    }
    
    const executionOrder = {
      'manifest-type': 1,
      'manifest-execution-order': 1,
    };
    
    Object.keys(infoObj).forEach((key) => {
      if (!infoKeyMap[key as keyof typeof infoKeyMap]) return;
      const index = infoKeyMap[key as keyof typeof infoKeyMap].indexOf(infoObj[key]);
      executionOrder[key as keyof typeof executionOrder] = index > -1 ? index : 1;
    });
    
    manifestConfig.executionOrder = `${executionOrder['manifest-execution-order']}-${executionOrder['manifest-type']}`;
  } else {
    manifestConfig.manifestType = infoKeyMap['manifest-type'][1];
    manifestConfig.executionOrder = '1-1';
  }

  manifestConfig.manifestPath = normalizePath(manifestPath, request);
  manifestConfig.selectedVariantName = await getPersonalizationVariant(
    manifestConfig.manifestPath,
    manifestConfig.variantNames,
    variantLabel,  // Use variantLabel like client-side
    request
  );

  manifestConfig.placeholderData = manifestPlaceholders || data?.placeholders?.data;
  manifestConfig.name = name;
  manifestConfig.manifest = manifestPath;
  manifestConfig.manifestUrl = manifestUrl;
  manifestConfig.disabled = disabled;
  manifestConfig.event = event;
  if (source?.length) manifestConfig.source = source;
  
  return manifestConfig;
}

// Create default experiment (exactly like client-side createDefaultExperiment)
function createDefaultExperiment(manifest: any) {
  return {
    disabled: manifest.disabled,
    event: manifest.event,
    manifest: manifest.manifestPath,
    executionOrder: '1-1',
    selectedVariant: { commands: [], fragments: [] },
    selectedVariantName: 'default',
    variantNames: ['all'],
    variants: {},
    source: ['promo'],
  };
}

// Clean and sort manifest list (like client-side cleanAndSortManifestList)
function cleanAndSortManifestList(manifests: any[], config: any): any[] {
  // logger.log(`🔄 Starting cleanAndSortManifestList with ${manifests.length} manifests`);
  
  const manifestObj: Record<string, any> = {};
  let allManifests = manifests;
  let targetManifestWinsOverServerManifest = false;
  
  // Include existing experiments if available
  if (config.mep?.experiments) {
    allManifests = [...manifests, ...config.mep.experiments];
  }
  
  allManifests.forEach((manifest) => {
    try {
      // Check for either manifest or manifestPath (server-side uses manifestPath)
      if (!manifest?.manifest && !manifest?.manifestPath) return;
      
      // Normalize manifest path
      if (!manifest.manifestPath) {
        manifest.manifestPath = normalizePath(manifest.manifest);
      }
      
      // Set manifest property if not present (for compatibility)
      if (!manifest.manifest) {
        manifest.manifest = manifest.manifestPath;
      }
      
      // Normalize manifest for non-target sources
      if (manifest.source && !manifest.source.includes('target')) {
        manifest.manifest = normalizePath(manifest.manifest);
      }
      
      if (manifest.manifestPath in manifestObj) {
        let fullManifest = manifestObj[manifest.manifestPath];
        let freshManifest = manifest;
        
        if (manifest.name) {
          fullManifest = manifest;
          freshManifest = manifestObj[manifest.manifestPath];
        }
        
        // Merge sources
        freshManifest.source = freshManifest.source.concat(fullManifest.source);
        freshManifest.name = fullManifest.name;
        freshManifest.selectedVariantName = fullManifest.selectedVariantName;
        
        // Target manifest wins over server manifest in prod
        targetManifestWinsOverServerManifest = config?.env?.name === 'prod' && 
          fullManifest.selectedVariantName?.startsWith('target-');

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

      // Set selected variant (like client-side)
      if (selectedVariantName && variantNames?.includes(selectedVariantName)) {
        // Debug: Always log the selectedVariantName and variantNames for debugging
        // logger.log(`Setting selectedVariant: selectedVariantName="${selectedVariantName}", variantNames=[${variantNames.join(',')}]`);
        
        // Debug: Check what's in the variants object for target variants
        if (selectedVariantName.includes('target-')) {
          // logger.log(`Target variant ${selectedVariantName} variants object:`, JSON.stringify(manifestConfig.variants[selectedVariantName]));
        }
        
        manifestConfig.selectedVariant = manifestConfig.variants[selectedVariantName];
        
        // Debug: Check what's in selectedVariant.commands after assignment
        if (selectedVariantName.includes('target-')) {
          // logger.log(`Target variant ${selectedVariantName} selectedVariant.commands:`, JSON.stringify(manifestConfig.selectedVariant?.commands));
        }
      } else {
        // logger.log(`Falling back to default: selectedVariantName="${selectedVariantName}", variantNames=[${variantNames?.join(',') || 'undefined'}]`);
        manifestConfig.selectedVariantName = 'default';
        manifestConfig.selectedVariant = 'default';
      }
      
      // Parse placeholders (like client-side)
      parsePlaceholders(placeholderData, config, manifestConfig.selectedVariantName);
      // logger.log(`Placeholders: ${JSON.stringify(config.placeholders)}`);
    } catch (e) {
      logger.log(`Error processing manifest: ${e}`);
    }
  });
  // logger.log(`Placeholders: ${JSON.stringify(config.placeholders)}`);
  // Remove variants from final objects (like client-side)
  Object.keys(manifestObj).forEach((key) => {
    delete manifestObj[key].variants;
  });
  
  // Sort by execution order (like client-side)
  const sortedManifests = Object.values(manifestObj).sort(compareExecutionOrder);
  
  // logger.log(`🏆 Final sorted order after cleanAndSortManifestList:`);
  sortedManifests.forEach((manifest, index) => {
    // logger.log(`🏆 ${index + 1}. ${manifest.manifestPath} (priority: ${manifest.priority || 0}, executionOrder: ${manifest.executionOrder || 0})`);
  });
  
  if (sortedManifests.length > 0) {
    // logger.log(`🏆 WINNER: ${sortedManifests[0].manifestPath} will take over the marquee`);
    
    // Track winner fragment processing
    const winner = sortedManifests[0];
    // logger.log(`🔍 Winner fragment count: ${winner.selectedVariant?.fragments?.length || 0}`);
    
    if (winner.selectedVariant?.fragments?.length > 0) {
      winner.selectedVariant.fragments.forEach((frag, index) => {
        // logger.log(`🔍 Winner fragment ${index + 1}: ${frag.selector} -> ${frag.val}`);
      });
    }
    
    // logger.log(`🔍 Winner commands count: ${winner.selectedVariant?.commands?.length || 0}`);
    // logger.log(`🔍 Winner placeholders: ${JSON.stringify(config.placeholders)}`);
  }
  
  return sortedManifests;
}

// Parse nested placeholders (like client-side parseNestedPlaceholders)
function parseNestedPlaceholders(config: any) {
  if (!config.placeholders) return;
  
  Object.entries(config.placeholders).forEach(([key, value]) => {
    if (typeof value === 'string') {
      config.placeholders[key] = replacePlaceholders(value, config.placeholders);
    }
  });
}
// Fetch manifest data (like client-side fetchData)
async function fetchManifestData(manifestPath: string, request: any): Promise<any> {
  try {
    // logger.log(`🌐 HTTP request for: ${manifestPath}`);
    const normalizedPath = normalizePath(manifestPath, true, request);
    // logger.log(`🔗 Normalized path: ${normalizedPath}`);
    
    const response = await httpRequest(normalizedPath, {
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'max-age=300' // Cache for 5 minutes
      }
    });

    if (!response.ok) {
      logger.log(`❌ HTTP ${response.status} for: ${manifestPath}`);
      return null;
    }

    // logger.log(`✅ HTTP ${response.status} for: ${manifestPath}`);

    const contentType = response.getHeader('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      logger.log(`❌ Invalid content-type: ${contentType} for: ${manifestPath}`);
      return null;
    }

    const manifestData = await response.json();
    if (!manifestData) {
      logger.log(`❌ Empty JSON response for: ${manifestPath}`);
      return null;
    }

    // logger.log(`✅ JSON parsed successfully for: ${manifestPath}`);
    return manifestData;
  } catch (error) {
    logger.log(`❌ Exception fetching ${manifestPath}: ${error}`);
    return null;
  }
}


