import { logger } from "log";
import { normalizePath } from "./ManifestUtils.js";

// Constants (exactly like client-side)
const TARGET_EXP_PREFIX = 'target-';

const MANIFEST_KEYS = [
  'action',
  'selector',
  'pagefilter',
  'page filter',
  'page filter optional',
];

const COMMANDS_KEYS = {
  remove: 'remove',
  replace: 'replace',
  updateAttribute: 'updateattribute',
};

const CREATE_CMDS = {
  insertafter: 'afterend',
  insertbefore: 'beforebegin',
  prepend: 'afterbegin',
  append: 'beforeend',
};

const GLOBAL_CMDS = [
  'insertscript',
  'replacepage',
  'updatemetadata',
  'useblockcode',
];

// Personalization keys (exactly like client-side PERSONALIZATION_KEYS)
const PERSONALIZATION_KEYS = [
  'all', 'chrome', 'firefox', 'safari', 'edge', 'android', 'ios', 'windows', 'mac',
  'mobile-device', 'phone', 'tablet', 'desktop', 'loggedout', 'loggedin'
];

// Normalize manifest type to match union
function normalizeManifestType(type) {
  const normalized = type?.toLowerCase().trim();
  
  switch (normalized) {
    case 'personalization':
    case 'pzn':
      return 'personalization';
    case 'promo':
    case 'promotional':
      return 'promo';
    case 'test':
    case 'testing':
      return 'test';
    default:
      return 'personalization'; // Default fallback
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

// Normalize keys (similar to normalizeKeys in personalization.js)
function normalizeKeys(obj) {
  return Object.keys(obj).reduce((newObj, key) => {
    newObj[toLowerAlpha(key)] = obj[key];
    return newObj;
  }, {});
}

function toLowerAlpha(str) {
  const modifiedStr = str.toLowerCase();
  if (!modifiedStr.includes('countryip') && !modifiedStr.includes('countrychoice') && !modifiedStr.includes('previouspage')) {
    return modifiedStr.replace(/[^a-z0-9\- _,&=:]/g, '');
  }
  return modifiedStr.replace(/[^a-z0-9\- _,&=:()/*]/g, (char) => (['(', ')', '/', '*'].includes(char) ? char : ''));
}

// Match glob pattern (similar to matchGlob in personalization.js)
export function matchGlob(searchStr, inputStr) {
  const pattern = searchStr.replace(/\*\*/g, '.*');
  const reg = new RegExp(`^${pattern}(\\.html)?$`, 'i');
  return reg.test(inputStr);
}

// Get variant info (exactly like client-side getVariantInfo)
function getVariantInfo(line, variantNames, variants, manifestPath, fTargetId, request) {
  const config = { mep: { preview: false } }; // Simplified config like client-side
  let manifestId = getFileName(manifestPath);
  let targetId = manifestId ? manifestId.replace('.json', '') : '';
  if (fTargetId) targetId = fTargetId;
  
  // retro support (like client-side)
  const action = line.action?.toLowerCase()
    .replace('content', '').replace('fragment', '').replace('tosection', '');
  
  if (!action) {
    logger.log('Row found with empty action field: ', line);
    return;
  }
  
  const pageFilter = line['page filter'] || line['page filter optional'];
  const { selector } = line;

  // Check page filter (exactly like client-side)
  if (pageFilter && !matchGlob(pageFilter, request?.path || '/')) return;

  const origin = 'https://example.com'; // Simplified for server-side
  
  variantNames.forEach((vn) => {
    const targetManifestId = vn.includes(TARGET_EXP_PREFIX) ? targetId : undefined;
    
    if (!line[vn] || line[vn].toLowerCase() === 'false') return;

    const variantInfo = {
      action,
      selector,
      pageFilter,
      content: line[vn],
      selectorType: getSelectorType(selector),
      manifestId,
      manifestPath,
      targetManifestId,
    };

    if (action in COMMANDS_KEYS && variantInfo.selectorType === 'fragment') {
      variants[vn].fragments.push({
        selector: normalizePath(variantInfo.selector.split(' #_')[0], request),
        val: normalizePath(line[vn], request),
        action,
        manifestId,
        manifestPath,
        targetManifestId,
      });
    } else if (GLOBAL_CMDS.includes(action)) {
      variants[vn][action] = variants[vn][action] || [];

      if (action === 'useblockcode') {
        const { blockSelector, blockTarget } = getBlockProps(line[vn], config, origin);
        variants[vn].useblockcode.push({
          selector: blockSelector,
          val: blockTarget,
          pageFilter,
          manifestId,
          manifestPath,
          targetManifestId,
        });
      } else {
        variants[vn][action].push({
          selector: normalizePath(selector, request),
          val: normalizePath(line[vn], request),
          pageFilter,
          manifestId,
          manifestPath,
          targetManifestId,
        });
      }
    } else if (action in COMMANDS_KEYS || action in CREATE_CMDS) {
      variants[vn].commands.push(variantInfo);
    }
  });
}

function getFileName(path) {
  return path?.split('/').pop();
}

function getSelectorType(selector) {
  const sel = selector.toLowerCase().trim();
  if (sel.startsWith('/') || sel.startsWith('http')) return 'fragment';
  return 'other';
}

function getBlockProps(fVal, config, origin) {
  let val = fVal;
  if (val?.includes('\\')) val = val?.split('\\').join('/');
  if (!val?.startsWith('/')) val = `/${val}`;
  const blockSelector = val?.split('/').pop() || '';

  if (val.startsWith('/libs/')) {
    val = `${config.miloLibs || config.codeRoot}${val.replace('/libs', '')}`;
  } else {
    val = `${origin}${val}`;
  }

  return { blockSelector, blockTarget: val };
}

// Parse manifest variants (exactly like client-side parseManifestVariants)
export function parseManifestVariants(data, manifestPath, targetId, request) {
  if (!data?.length) {
    return null;
  }

  const manifestConfig = {};
  const experiences = data.map((d) => normalizeKeys(d));

  try {
    const variants = {};
    const variantNames = Object.keys(experiences[0])
      .filter((vn) => !MANIFEST_KEYS.includes(vn));

    variantNames.forEach((vn) => {
      variants[vn] = { commands: [], fragments: [] };
    });

    experiences.forEach((line) => {
      getVariantInfo(line, variantNames, variants, manifestPath, targetId, request);
    });

    manifestConfig.variants = variants;
    manifestConfig.variantNames = variantNames;
    
    // Set manifestId like client-side (based on config.mep?.preview)
    const config = { mep: { preview: false } }; // Simplified for server-side

    return manifestConfig;
  } catch (e) {
    logger.log('error parsing personalization manifestConfig:', e, 'for manifestPath:', manifestPath);
  }
  return null;
}

// Get personalization variant (exactly like client-side getPersonalizationVariant)
export async function getPersonalizationVariant(
  manifestPath,
  variantNames = [],
  variantLabel = null,
  request
) {
  // Check for variant override (like client-side)
  const config = { mep: { variantOverride: {} } }; // Simplified for server-side
  if (config.mep?.variantOverride?.[manifestPath]) {
    return config.mep.variantOverride[manifestPath];
  }

  const variantInfo = buildVariantInfo(variantNames);

  // Handle entitlements (like client-side)
  const entitlementKeys = []; // Simplified for server-side
  const hasEntitlementTag = entitlementKeys.some((tag) => variantInfo.allNames.includes(tag));

  let userEntitlements = [];
  if (hasEntitlementTag) {
    if (config?.mep?.enablePersV2) {
      userEntitlements = [];
    } else {
      userEntitlements = []; // Simplified for server-side
    }
  }

  const hasMatch = (name) => {
    if (!name) return true;
    if (name === variantLabel?.toLowerCase()) return true;
    if (name.startsWith('param-')) return checkForParamMatch(name, request);
    if (name.toLowerCase().startsWith('previouspage-')) return checkForPreviousPageMatch(name, request);
    if (hasCountryMatch(name, request)) return true;
    if (userEntitlements?.includes(name)) return true;
    
    // Check personalization tags (exactly like client-side)
    return PERSONALIZATION_KEYS.includes(name) && checkPersonalizationTag(name, request);
  };

  const matchVariant = (n) => {
    // split before checks (exactly like client-side)
    const name = n.includes(':') ? n.split(':')[1] : n;
    
    // Target variants should always match since they are explicitly defined
    if (name.startsWith(TARGET_EXP_PREFIX)) return true;
    
    const processedList = name.split('&').map((condition) => {
      const reverse = condition.trim().startsWith('not ');
      const match = hasMatch(condition.replace('not ', '').trim());
      return reverse ? !match : match;
    });
    return !processedList.includes(false);
  };

  // Set MEP country (like client-side)
  if (config.mep?.geoLocation) {
    // Simplified for server-side - would need proper country detection
  }

  const matchingVariant = variantNames.find((variant) => variantInfo[variant].some(matchVariant));
  return matchingVariant || 'default';
}

function buildVariantInfo(variantNames) {
  return variantNames.reduce((acc, name) => {
    let nameArr = [name];
    if (!name.startsWith(TARGET_EXP_PREFIX)) nameArr = name.split(/,(?![^(]*\))/);
    acc[name] = nameArr.map((v) => v.trim()).filter(Boolean);
    acc.allNames = [...(acc.allNames || []), ...name.split(/(?:\([^)]*\))?,|&|\bnot\b/).map((v) => v.trim()).filter(Boolean)];
    return acc;
  }, { allNames: [] });
}

function checkForParamMatch(paramStr, request) {
  const [name, val] = paramStr.split('param-')[1].split('=');
  if (!name) return false;
  
  const queryParams = request.query || '';
  const params = new URLSearchParams(queryParams);
  const searchParamVal = params.get(name.toLowerCase());
  
  if (searchParamVal !== null) {
    if (val) return val === searchParamVal;
    return true;
  }
  return false;
}

function checkForPreviousPageMatch(previousPageStr, request) {
  const referer = request.getHeaders()['referer'] || '';
  if (!referer) return false;
  
  const previousPageString = previousPageStr.toLowerCase().split('previouspage-')[1];
  return matchGlob(previousPageString, new URL(referer).pathname);
}

function hasCountryMatch(name, request) {
  // Simplified country matching - you'll need to implement based on your geo detection
  return false;
}

// Check personalization tag (exactly like client-side hasMatch function)
function checkPersonalizationTag(tag, request) {
  if (!tag) return true;
  
  // Get user agent and other context from request (like client-side navigator.userAgent)
  const userAgent = request?.headers?.['user-agent'] || '';
  const isMobile = /android|iphone|mobile/.test(userAgent.toLowerCase()) && !/ipad/.test(userAgent.toLowerCase());
  const isTablet = /ipad|tablet/.test(userAgent.toLowerCase()) || 
                   (/macintosh/.test(userAgent.toLowerCase()) && request?.headers?.['max-touch-points'] > 1);
  const isDesktop = !isMobile && !isTablet;
  
  // Get screen dimensions from request headers (like client-side window.screen)
  const screenWidth = parseInt(request?.headers?.['x-screen-width'] || '1920', 10);
  const screenHeight = parseInt(request?.headers?.['x-screen-height'] || '1080', 10);
  const PHONE_SIZE = screenWidth < 550 || screenHeight < 550;
  
  // Check if user is logged in (like client-side window.adobeIMS?.isSignedInUser())
  const isLoggedIn = request?.headers?.['x-adobe-ims-signed-in'] === 'true';
  
  // Implement exact same logic as client-side PERSONALIZATION_TAGS
  switch (tag.toLowerCase()) {
    case 'all':
      return true;
    case 'chrome':
      return userAgent.includes('Chrome') && !userAgent.includes('Edg');
    case 'firefox':
      return userAgent.includes('Firefox');
    case 'safari':
      return userAgent.includes('Safari') && !userAgent.includes('Chrome');
    case 'edge':
      return userAgent.includes('Edg');
    case 'android':
      return userAgent.includes('Android') || isTablet;
    case 'ios':
      return /iPad|iPhone|iPod/.test(userAgent) || isTablet;
    case 'windows':
      return userAgent.includes('Windows');
    case 'mac':
      return userAgent.includes('Macintosh') && !isTablet;
    case 'mobile-device':
      return isTablet || isMobile;
    case 'phone':
      return (isTablet || isMobile) && PHONE_SIZE;
    case 'tablet':
      return (isTablet || isMobile) && !PHONE_SIZE;
    case 'desktop':
      return isDesktop;
    case 'loggedout':
      return !isLoggedIn;
    case 'loggedin':
      return isLoggedIn;
    default:
      return false;
  }
}

// Parse manifest config (similar to getManifestConfig in personalization.js)
export async function parseManifestConfig(
  manifestData,
  manifestPath,
  request
) {
  if (!manifestData) {
    logger.log('No manifestData provided for:', manifestPath);
    return null;
  }

  const persData = manifestData?.experiences?.data || manifestData?.data || manifestData;
  if (!persData) {
    logger.log('No persData found in manifestData for:', manifestPath);
    return null;
  }

  const infoTab = manifestData?.info?.data;
  const infoObj = infoTab?.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});

  const manifestOverrideName = infoObj?.['manifest-override-name']?.toLowerCase();
  const targetId = manifestOverrideName;
  const manifestConfig = parseManifestVariants(persData, manifestPath, targetId, request);

  if (!manifestConfig) {
    logger.log('Error loading personalization manifestConfig: ', manifestPath);
    return null;
  }

  // Set manifest type and execution order
  const infoKeyMap = {
    'manifest-type': ['Personalization', 'Promo', 'Test'],
    'manifest-execution-order': ['First', 'Normal', 'Last'],
  };

  if (infoTab) {
    manifestConfig.manifestType = infoObj?.['manifest-type']?.toLowerCase();
    if (manifestConfig.manifestType === 'personalization') {
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

  manifestConfig.manifestPath = normalizePath(manifestPath, request);
  manifestConfig.selectedVariantName = await getPersonalizationVariant(
    manifestConfig.manifestPath,
    manifestConfig.variantNames,
    null,
    request
  );

  manifestConfig.selectedVariant = manifestConfig.variants[manifestConfig.selectedVariantName] || { commands: [], fragments: [] };

  // Extract placeholder data (like client-side)
  const manifestPlaceholders = manifestData?.placeholders?.data;
  manifestConfig.placeholderData = manifestPlaceholders;

  return manifestConfig;
}
