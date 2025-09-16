import { httpRequest } from "http-request";
import { logger } from "log";
import { combineMepSources, determineLocale, normalizePath } from "./ManifestUtils.js";
import { parseManifestConfig } from "./ManifestParser.js";

// Fetch manifest data from URL
async function fetchManifestData(manifestPath, request) {
  try {
    // Normalize the manifest path first
    const normalizedPath = normalizePath(manifestPath, true, request);
    
    const response = await httpRequest(normalizedPath, {
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'max-age=300' // Cache for 5 minutes
      }
    });

    if (!response.ok) {
      logger.log(`Failed to fetch manifest ${normalizedPath}: ${response.status}`);
      return null;
    }

    // Check if response is JSON
    const contentType = response.getHeader('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      logger.log(`Invalid content type for manifest ${normalizedPath}: ${contentType}`);
      return null;
    }

    // Parse JSON with error handling
    let manifestData;
    try {
      manifestData = await response.json();
    } catch (jsonError) {
      logger.log(`Failed to parse JSON for manifest ${normalizedPath}: ${jsonError}`);
      return null;
    }

    // Validate that we got actual data
    if (!manifestData) {
      logger.log(`Empty manifest data for ${normalizedPath}`);
      return null;
    }

    return manifestData;
  } catch (error) {
    logger.log(`Error fetching manifest ${manifestPath}: ${error}`);
    return null;
  }
}

// Load and parse a single manifest
async function loadSingleManifest(
  manifestSource, 
  request
) {
  try {
    const manifestData = await fetchManifestData(manifestSource.manifestPath, request);
    if (!manifestData) {
      return null;
    }

    const manifest = await parseManifestConfig(manifestData, manifestSource.manifestPath, request);
    if (!manifest) {
      logger.log(`Failed to parse manifest: ${manifestSource.manifestPath}`);
      return null;
    }

    return {
      manifest,
      source: manifestSource.source
    };
  } catch (error) {
    logger.log(`Error loading manifest ${manifestSource.manifestPath}: ${error}`);
    return null;
  }
}

// Sort manifests by execution order
function sortManifestsByExecutionOrder(manifests) {
  return manifests.sort((a, b) => {
    const orderA = a.manifest.executionOrder;
    const orderB = b.manifest.executionOrder;
    
    if (orderA === orderB) return 0;
    return orderA > orderB ? 1 : -1;
  });
}

// Clean and consolidate manifest list (similar to cleanAndSortManifestList in personalization.js)
function cleanAndSortManifestList(manifests) {
  const manifestObj = {};
  
  manifests.forEach((manifest) => {
    try {
      if (!manifest?.manifest?.manifestPath) return;
      
      const manifestPath = manifest.manifest.manifestPath;
      
      if (manifestPath in manifestObj) {
        // Merge manifests with same path
        const existing = manifestObj[manifestPath];
        const fresh = manifest;
        
        // Merge sources
        fresh.source = fresh.source.concat(existing.source);
        
        // Use the one with higher priority (you can implement priority logic here)
        manifestObj[manifestPath] = fresh;
      } else {
        manifestObj[manifestPath] = manifest;
      }
    } catch (e) {
      logger.log(`Error processing manifest: ${e}`);
    }
  });
  
  return Object.values(manifestObj);
}

// Manual URLSearchParams implementation for EdgeWorkers
function parseQueryParams(queryString) {
  const params = {};
  
  if (!queryString) return params;
  
  queryString.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  });
  
  return params;
}

// Load manifests from HTML content - Return RAW SOURCES only (like client-side combineMepSources)
export async function loadManifests(htmlContent, request) {
  try {
    // Parse query parameters manually
    const queryParams = parseQueryParams(request.query || '');
    
    // Determine locale from request
    const { determineLocale } = await import('../Utilities/Utilities.js');
    const locale = determineLocale(request);
    
    // Get manifest sources from HTML - Return RAW SOURCES only
    const manifestSources = await combineMepSources(htmlContent, queryParams, locale);
    
    if (!manifestSources.length) {
      logger.log("No manifest sources found");
      return [];
    }
    
    // Return RAW SOURCES only (no processing) - like client-side combineMepSources
    return manifestSources;
  } catch (error) {
    logger.log(`Error loading manifests: ${error}`);
    return [];
  }
}

// Load Target manifests from API - Return RAW SOURCES only (like client-side handleAlloyResponse)
export async function loadTargetManifests(
  request,
  authState
) {
  try {
    // Import the Target API call function and handleAlloyResponse
    const { fetchPersonalizationData, handleAlloyResponse } = await import('./Personalize.js');
    
    // Get Target response
    const targetResponse = await fetchPersonalizationData(request, authState);
    
    if (!targetResponse) {
      logger.log("No Target response received");
      return [];
    }
    
    // Process the Target response to extract manifests using handleAlloyResponse
    const targetManifests = handleAlloyResponse(targetResponse);
    
    if (!targetManifests.length) {
      logger.log("No Target manifests found in response");
      return [];
    }
    
    // Convert Target manifests to RAW SOURCES format (like client-side)
    const rawTargetSources = [];
    
    for (const targetManifest of targetManifests) {
      try {
        // Create RAW SOURCE (just path + source info) - no processing
        rawTargetSources.push({
          manifestPath: targetManifest.manifestPath,
          source: ['target-api']
        });
      } catch (error) {
        logger.log(`Error processing Target manifest ${targetManifest.manifestPath}: ${error}`);
      }
    }
    
    return rawTargetSources;
  } catch (error) {
    logger.log(`Error loading Target manifests: ${error}`);
    return [];
  }
}

// Get all manifests (personalization + target) - Combine RAW SOURCES only (no processing)
export async function getAllManifests(
  htmlContent,
  request,
  authState
) {
  const personalizationManifests = await loadManifests(htmlContent, request);
  const targetManifests = await loadTargetManifests(request, authState);
  
  const allManifests = [...personalizationManifests, ...targetManifests];
  
  return allManifests;
}

// Validate manifest structure
export function validateManifest(manifest) {
  if (!manifest || !manifest.variants || !manifest.variantNames) {
    return false;
  }
  
  // Check if selected variant exists
  if (manifest.selectedVariantName && !manifest.variants[manifest.selectedVariantName]) {
    logger.log(`Selected variant ${manifest.selectedVariantName} not found in manifest`);
    return false;
  }
  
  return true;
}

// Get manifest summary for logging
export function getManifestSummary(manifests) {
  if (!manifests.length) return "No manifests loaded";
  
  const summary = manifests.map(m => ({
    path: m.manifest.manifestPath,
    type: m.manifest.manifestType,
    variant: m.manifest.selectedVariantName,
    commands: m.manifest.selectedVariant?.commands?.length || 0,
    fragments: m.manifest.selectedVariant?.fragments?.length || 0,
    source: m.source.join(', ')
  }));
  
  return JSON.stringify(summary, null, 2);
}
