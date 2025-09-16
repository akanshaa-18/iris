import { determineLocale } from "../Utilities/Utilities.js";
import { httpRequest } from "http-request";
import { logger } from "log";
import { loadManifests, getAllManifests, getManifestSummary } from "./ManifestLoader.js";
import { 
  parseManifestConfig, 
  parseManifestVariants, 
  getPersonalizationVariant,
  matchGlob 
} from "./ManifestParser.js";
import { normalizePath, replacePlaceholders, getFileName } from "./ManifestUtils.js";

// Constants
const AMCV_COOKIE = 'AMCV_9E1005A551ED61CA0A490D45@AdobeOrg';
const REPORT_SUITES_ID = 'adobecom,adobecomdev';
const AT_PROPERTY_VAL = 'bc8dfa27-29cc-625c-22ea-f7ccebfc6231';

// Helper function to determine selector type
function getSelectorType(selector) {
  const sel = selector?.toLowerCase().trim();
  if (sel?.startsWith("/") || sel?.startsWith("http")) return "fragment";
  return "other";
}

// Helper function to get Target property based on page region
function getTargetPropertyBasedOnPageRegion({ env, pathname }) {
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

// Process Adobe Alloy/Target response (mirrors client-side handleAlloyResponse exactly)
function handleAlloyResponse(response) {
  // Find the personalization:decisions from the handle array
  const personalizationDecisions = response?.handle?.find((h) => h.type === "personalization:decisions");
  
  if (!personalizationDecisions?.payload) {
    return [];
  }

  return personalizationDecisions.payload
    ?.map((i) => {
      const { id } = i;
      return i.items.map((item) => ({ ...item, id }));
    })
    ?.flat()
    ?.map((item) => {
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
async function fetchMainPagePlaceholders(request, locale) {
  try {
    // Build contentRoot like client-side (from config.locale.contentRoot)
    const hostname = request.host || 'www.adobe.com';
    const env = request.host?.includes('stage') || request.host?.includes('dev') ? 'stage' : 'prod';
    const origin = `https://${hostname}`;
    const contentRoot = `${origin}${locale.prefix}`;
    
    // Build placeholder paths (like client-side getPlaceholdersPath)
    const root = `${contentRoot}/cc-shared/placeholders`;
    const paths = [`${root}.json`];
    
    // Parse placeholder JSON (like client-side parsePlaceholderJson)
    const parsePlaceholderJson = async (resp, placeholders) => {
      try {
        const json = resp.ok ? await resp.json() : { data: [] };
        json.data?.forEach((item) => {
          placeholders[item.key] = item.value;
        });
      } catch (e) {
        logger.log(`❌ Error parsing placeholder json: ${e}`);
      }
    };
    
    // Fetch placeholder (like client-side fetchPlaceholder)
    const fetchPlaceholder = async (path) => {
      try {
        const response = await httpRequest(path, {
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'max-age=300'
          }
        });
        
        const placeholders = {};
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
    const mergedPlaceholders = {};
    placeholderResults.forEach(result => {
      if (result && typeof result === 'object') {
        Object.assign(mergedPlaceholders, result);
      }
    });
    
    // Add fallback for missing placeholders (like client-side keyToStr)
    const keyToStr = (key) => key.replaceAll('-', ' ');
    
    return mergedPlaceholders;
    
  } catch (error) {
    logger.log(`❌ Error in fetchMainPagePlaceholders: ${error}`);
    return {};
  }
}

export async function getPersonalizationData(request, authState, htmlContent) {
  const startTime = Date.now();
  
  try {
    // Load all RAW MANIFEST SOURCES (like client-side combineMepSources + handleAlloyResponse)
    const manifestSources = await getAllManifests(htmlContent, request, authState);
    
    if (!manifestSources.length) {
      logger.log("No manifest sources found for personalization");
      return { fragments: [], commands: [], placeholders: {} };
    }
    
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
      placeholders: [], 
      locale: locale,
      env: { name: env }
    };
    
    // Process each manifest source (like client-side getManifestConfig)
    for (let i = 0; i < experiments.length; i += 1) {
      const manifestSource = experiments[i];
      
      // Get manifest config (like client-side getManifestConfig)
      const experiment = await getManifestConfig(manifestSource, false, request);
      if (experiment) {
        experiments[i] = experiment;
      } else {
        logger.log(`❌ Failed to process manifest: ${manifestSource.manifestPath}`);
        experiments[i] = null;
      }
    }
    
    // Clean and sort manifest list (like client-side cleanAndSortManifestList)
    experiments = cleanAndSortManifestList(experiments, config);
    
    if (experiments.length > 0) {
      // Winner found
    }
    
    // Parse nested placeholders (like client-side parseNestedPlaceholders)
    parseNestedPlaceholders(config);
    
    // Categorize actions (like client-side categorizeActions)
    let results = [];
    for (const experiment of experiments) {
      const result = await categorizeActions(experiment, config);
      
      if (result) results.push(result);
    }
    results = results.filter(Boolean);
    
    // Store experiments (like client-side)
    config.mep.experiments = [...config.mep.experiments, ...experiments];
    
    // Consolidate all actions (like client-side consolidateObjects and consolidateArray)
    config.mep.blocks = consolidateObjects(results, 'blocks', config.mep.blocks);
    config.mep.fragments = consolidateObjects(results, 'fragments', config.mep.fragments);
    
    config.mep.commands = consolidateArray(results, 'commands', config.mep.commands);
    
    const endTime = Date.now();
    
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
function checkPageFilter(pageFilter, request) {
  if (!pageFilter) return true;
  
  // Get the actual path from request
  const requestPath = request.path || '/';
  
  // Simple path matching (can be enhanced with glob patterns)
  return requestPath.includes(pageFilter) || pageFilter.includes(requestPath);
}

// KEEPING YOUR COMPLETE TARGET API REQUEST BODY
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

  // Make the request to Adobe Target using httpRequest instead of fetch
  const targetResp = await httpRequest(`${TARGET_API_URL}?dataStreamId=${DATA_STREAM_ID}&requestId=${generateUUIDv4()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const responseData = await targetResp.json();

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

function parseRawData(targetData) {
  // Extract personalization decisions
  const propositions = targetData?.handle?.find((d) => d.type === "personalization:decisions")?.payload || [];

  if (propositions.length === 0) {
    return { fragments: [], commands: [], placeholders: {} };
  }

  logger.log(`Found ${propositions.length} propositions`);

  // Process propositions to extract fragments and commands
  const fragments = [];
  const commands = [];
  const placeholders = {};

  propositions.forEach((proposition) => {
    proposition.items?.forEach((item) => {
      if (item.data?.format === "application/json") {
        const content = item.data.content;
        if (content?.manifestContent) {
          const experiences = content.manifestContent?.experiences?.data || content.manifestContent?.data || [];

          experiences.forEach((experience) => {
            const action = experience.action
              ?.toLowerCase()
              .replace("content", "")
              .replace("fragment", "")
              .replace("tosection", "");

            const selector = experience.selector;
            const variantNames = Object.keys(experience).filter(
              (key) => !["action", "selector", "pagefilter", "page filter", "page filter optional"].includes(
                key.toLowerCase()
              )
            );

            variantNames.forEach((variant) => {
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

// Export handleAlloyResponse and fetchPersonalizationData for use in ManifestLoader
export { handleAlloyResponse, fetchPersonalizationData };

// Consolidate objects (like client-side consolidateObjects)
function consolidateObjects(results, key, existing = []) {
  const consolidated = [...existing];
  
  results.forEach(result => {
    if (result[key]) {
      consolidated.push(...result[key]);
    }
  });
  
  return consolidated;
}

// Consolidate arrays (like client-side consolidateArray)
function consolidateArray(results, key, existing = []) {
  const consolidated = [...existing];
  
  results.forEach(result => {
    if (result[key]) {
      consolidated.push(...result[key]);
    }
  });
  
  return consolidated;
}

// Handle commands (like client-side handleCommands) - this processes both commands AND fragments together
function handleCommands(commands, config) {
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
function parsePlaceholders(placeholderData, config, variantName) {
  if (!placeholderData?.length || variantName === 'default') {
    return config;
  }
  
  // Get locale and MEP info from config (like client-side)
  const { countryIP, countryChoice } = config.mep || {};
  const locale = config.locale || {};
  
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
  
  // Find the matching key (like client-side)
  const keys = placeholderData?.length ? Object.entries(placeholderData[0]) : [];
  
  const keyVal = keys.find(([key]) => {
    const modifiedStr = key.toLowerCase();
    return valueNames.includes(modifiedStr) || hasCountryMatch(modifiedStr, config);
  });
  const key = keyVal?.[0];

  if (key) {
    // Build results object (like client-side)
    const results = placeholderData.reduce((res, item) => {
      res[item.key] = item[key];
      return res;
    }, {});
    
    // Store in config (like client-side)
    config.placeholders = { ...(config.placeholders || {}), ...results };
  } else {
    logger.log(`No matching key found for placeholder processing`);
  }
  
  return config;
}

// Helper function for country matching (like client-side hasCountryMatch)
function hasCountryMatch(str, config) {
  if (str.includes('countrychoice') || str.includes('countryip')) {
    const modifiedStr = str.replace('uk', 'gb');
    return matchesCountryChoiceOrIP(modifiedStr, config);
  }
  return false;
}

// Helper function for country choice/IP matching (like client-side matchesCountryChoiceOrIP)
function matchesCountryChoiceOrIP(name, config) {
  if (!name.includes('countrychoice') && !name.includes('countryip')) return false;
  const countryList = name.match(/\(([^)]+)\)/)?.[1]?.split(',').map((c) => c.trim());
  if (!countryList?.length) return false;
  const { countryChoice, countryIP } = config.mep || {};
  const testCountry = name.includes('countrychoice') ? countryChoice : countryIP;
  return countryList.includes(testCountry);
}

// Set metadata function (like client-side setMetadata)
function setMetadata(metadata) {
  // For server-side, we might want to log or handle metadata differently
  logger.log(`Metadata to update: ${JSON.stringify(metadata)}`);
}

// Parse MEP parameter (like client-side parseMepParam)
function parseMepParam(mepParam) {
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
function compareExecutionOrder(a, b) {
  if (a.executionOrder === b.executionOrder) return 0;
  return a.executionOrder > b.executionOrder ? 1 : -1;
}

// Normalize fragment paths (like client-side normalizeFragPaths)
function normalizeFragPaths({ selector, val, action, manifestId, manifestPath, targetManifestId }) {
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
async function categorizeActions(experiment, config) {
  if (!experiment) return null;
  
  const { manifestPath, selectedVariant } = experiment;
  
  if (!selectedVariant || selectedVariant === 'default') return { experiment };

  // Handle replacepage (like client-side)
  const { replacepage } = selectedVariant;
  if (selectedVariant.replacepage?.length) {
    config.mep.replacepage = replacepage[0];
  }

  // Handle insertscript (like client-side)
  selectedVariant.insertscript?.map((script) => {
    logger.log(`Script to load: ${script.val}`);
  });

  // Handle updatemetadata (like client-side)
  selectedVariant.updatemetadata?.map((metadata) => setMetadata(metadata));

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
async function getManifestConfig(info = {}, variantOverride = false, request) {
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
  const infoObj = infoTab?.reduce((acc, item) => {
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
      if (!infoKeyMap[key]) return;
      const index = infoKeyMap[key].indexOf(infoObj[key]);
      executionOrder[key] = index > -1 ? index : 1;
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
function createDefaultExperiment(manifest) {
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
function cleanAndSortManifestList(manifests, config) {
  const manifestObj = {};
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
        manifestConfig.selectedVariant = manifestConfig.variants[selectedVariantName];
      } else {
        manifestConfig.selectedVariantName = 'default';
        manifestConfig.selectedVariant = 'default';
      }
      
      // Parse placeholders (like client-side)
      parsePlaceholders(placeholderData, config, manifestConfig.selectedVariantName);
    } catch (e) {
      logger.log(`Error processing manifest: ${e}`);
    }
  });
  
  // Remove variants from final objects (like client-side)
  Object.keys(manifestObj).forEach((key) => {
    delete manifestObj[key].variants;
  });
  
  // Sort by execution order (like client-side)
  const sortedManifests = Object.values(manifestObj).sort(compareExecutionOrder);
  
  return sortedManifests;
}

// Parse nested placeholders (like client-side parseNestedPlaceholders)
function parseNestedPlaceholders(config) {
  if (!config.placeholders) return;
  
  Object.entries(config.placeholders).forEach(([key, value]) => {
    if (typeof value === 'string') {
      config.placeholders[key] = replacePlaceholders(value, config.placeholders);
    }
  });
}

// Fetch manifest data (like client-side fetchData)
async function fetchManifestData(manifestPath, request) {
  try {
    const normalizedPath = normalizePath(manifestPath, true, request);
    
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

    return manifestData;
  } catch (error) {
    logger.log(`❌ Exception fetching ${manifestPath}: ${error}`);
    return null;
  }
}
