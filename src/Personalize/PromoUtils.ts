// Promo utilities adapted for server-side Akamai EdgeWorkers
// Using console.log for server-side logging
import { logger } from "log";

// Regional constants
const APAC = ['au', 'cn', 'hk_en', 'hk_zh', 'id_en', 'id_id', 'in', 'in_hi', 'kr', 'my_en', 'my_ms', 'nz', 'ph_en', 'ph_fil', 'sg', 'th_en', 'th_th', 'tw', 'vn_en', 'vn_vi'];
const EMEA = ['ae_en', 'ae_ar', 'africa', 'at', 'be_en', 'be_fr', 'be_nl', 'bg', 'ch_de', 'ch_fr', 'ch_it', 'cis_en', 'cis_ru', 'cz', 'de', 'dk', 'ee', 'eg_ar', 'eg_en', 'es', 'fi', 'fr', 'gr_el', 'gr_en', 'hu', 'ie', 'il_en', 'il_he', 'iq', 'is', 'it', 'kw_ar', 'kw_en', 'lt', 'lu_de', 'lu_en', 'lu_fr', 'lv', 'mena_ar', 'mena_en', 'ng', 'nl', 'no', 'pl', 'pt', 'qa_ar', 'qa_en', 'ro', 'ru', 'sa_en', 'sa_ar', 'se', 'si', 'sk', 'tr', 'ua', 'uk', 'za'];
const AMERICAS = ['us', 'ar', 'br', 'ca', 'ca_fr', 'cl', 'co', 'cr', 'ec', 'gt', 'la', 'mx', 'pe', 'pr'];
const JP = ['jp'];
const REGIONS = { APAC, EMEA, AMERICAS, JP };

// Function to get locale code from request
function getLocaleCode(request: { path: string }): string {
  const path = request.path;
  const pathParts = path.split('/');
  const localeCode = pathParts[1] || 'us';
  return localeCode;
}

// Function to get region code
function getRegionCode(request: { path: string }): string | null {
  const localeCode = getLocaleCode(request);
  const regionCode = Object.keys(REGIONS)
    .find((r) => REGIONS[r as keyof typeof REGIONS]?.includes(localeCode))?.toLowerCase() || null;
  return regionCode;
}

// Function to convert GMT string to local date
const GMTStringToLocalDate = (gmtString: string) => new Date(`${gmtString}+00:00`);

// Function to check if event is disabled
export const isDisabled = (event: any, searchParams: any) => {
  if (!event) return false;
  
  const localeCode = getLocaleCode({ path: '' }); // We'll need to pass request context
  if (event.locales && !event.locales.includes(localeCode)) return true;
  
  const instantParam = searchParams?.get ? searchParams.get('instant') : null;
  const currentDate = instantParam ? new Date(instantParam) : new Date();
  if ((!event.start && event.end) || (!event.end && event.start)) return true;
  
  return Boolean(event.start && event.end
    && (currentDate < event.start || currentDate > event.end));
};

// Function to check if manifest is within locale
const isManifestWithinLocale = (locales: string, request: any) => {
  if (!locales) return true;
  const localeCode = getLocaleCode(request);
  return locales.split(';').map((locale: string) => locale.trim()).includes(localeCode);
};

// Function to get metadata from request headers or query params
function getMetadata(key: string, request: any): string | null {
  // For server-side, we'll need to get metadata from headers or query params
  // This is a simplified version - in practice, you'd need to pass metadata context
  const headers = request.getHeaders();
  
  logger.log('Phase 5: Debug - getMetadata - key:', key);
  logger.log('Phase 5: Debug - getMetadata - headers:', headers);
  
  // Check headers first
  const headerKey = `x-metadata-${key}`;
  if (headers[headerKey]) {
    const result = headers[headerKey][0];
    logger.log('Phase 5: Debug - getMetadata - found in headers:', result);
    return result;
  }
  
  // Manual query parameter parsing for Akamai
  const queryString = request.query || '';
  if (queryString) {
    const queryParams = new Map();
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        queryParams.set(key, decodeURIComponent(value));
      }
    });
    const result = queryParams.get(key) || null;
    logger.log('Phase 5: Debug - getMetadata - found in query:', result);
    return result;
  }
  
  // TODO: This is the main issue - metadata is in HTML content, not headers
  // We need to extract metadata from HTML during the rewriting phase
  // For now, return null and handle this during HTML rewriting
  logger.log('Phase 5: Debug - getMetadata - not found (metadata should be in HTML)');
  return null;
}

// Function to get regional promo manifests
const getRegionalPromoManifests = (manifestNames: string, region: string | null, searchParams: any, request: any) => {
  const attachedManifests = manifestNames
    ? manifestNames.split(',')?.map((manifest: string) => manifest?.trim())
    : [];

  const schedule = getMetadata(region ? `${region}_schedule` : 'schedule', request);
  if (!schedule) {
    return [];
  }
  
  return schedule.split(',')
    .map((manifest: string) => {
      const [name, start, end, manifestPath, locales, cdtStart, cdtEnd] = manifest.trim().split('|').map((s: string) => s.trim());
      if (attachedManifests.includes(name) && isManifestWithinLocale(locales, request)) {
        const event = {
          name,
          start: GMTStringToLocalDate(start),
          end: GMTStringToLocalDate(end),
          cdtStart,
          cdtEnd,
        };
        const disabled = isDisabled(event, searchParams);
        return { manifestPath, disabled, event, source: ['promo'] };
      }
      return null;
    })
    .filter((manifest: any) => manifest != null);
};

// Main function to get promo manifests
export default function getPromoManifests(manifestNames: any, searchParams: any, request: any) {
  const regionCode = getRegionCode(request);
  
  const promoManifests = regionCode != null ? getRegionalPromoManifests(
    manifestNames[`${regionCode}_manifestnames`],
    regionCode,
    searchParams,
    request,
  ) : [];
  
  const globalPromoManifests = getRegionalPromoManifests(
    manifestNames.manifestnames,
    null,
    searchParams,
    request,
  );
  
  logger.log('Promo manifests found:', {
    regional: promoManifests.length,
    global: globalPromoManifests.length,
    total: promoManifests.length + globalPromoManifests.length
  });
  
  return [...promoManifests, ...globalPromoManifests];
}

// Function to parse manifest names from metadata
export function parseManifestNames(request: any): any {
  const regionCode = getRegionCode(request);
  const manifestNames: any = {};
  
  logger.log('Phase 5: Debug - parseManifestNames - regionCode:', regionCode);
  
  // Get global manifest names
  const globalManifestNames = getMetadata('manifestnames', request);
  logger.log('Phase 5: Debug - parseManifestNames - globalManifestNames:', globalManifestNames);
  if (globalManifestNames) {
    manifestNames.manifestnames = globalManifestNames;
  }
  
  // Get regional manifest names
  if (regionCode) {
    const regionalManifestNames = getMetadata(`${regionCode}_manifestnames`, request);
    logger.log('Phase 5: Debug - parseManifestNames - regionalManifestNames:', regionalManifestNames);
    if (regionalManifestNames) {
      manifestNames[`${regionCode}_manifestnames`] = regionalManifestNames;
    }
  }
  
  logger.log('Phase 5: Debug - parseManifestNames - final manifestNames:', manifestNames);
  return manifestNames;
}

// Function to parse manifest names from HTML metadata
export function parseManifestNamesFromMetadata(metadata?: Record<string, string>): any {
  const manifestNames: any = {};
  
  if (!metadata) {
    logger.log('Phase 5: Debug - parseManifestNamesFromMetadata - no metadata provided');
    return manifestNames;
  }
  
  logger.log('Phase 5: Debug - parseManifestNamesFromMetadata - metadata keys:', Object.keys(metadata));
  
  // Get global manifest names
  const globalManifestNames = metadata['manifestnames'];
  logger.log('Phase 5: Debug - parseManifestNamesFromMetadata - globalManifestNames:', globalManifestNames);
  if (globalManifestNames) {
    manifestNames.manifestnames = globalManifestNames;
  }
  
  // Get regional manifest names
  const regions = ['apac', 'emea', 'americas', 'jp'];
  regions.forEach(region => {
    const regionalManifestNames = metadata[`${region}_manifestnames`];
    if (regionalManifestNames) {
      manifestNames[`${region}_manifestnames`] = regionalManifestNames;
      logger.log(`Phase 5: Debug - parseManifestNamesFromMetadata - ${region}_manifestnames:`, regionalManifestNames);
    }
  });
  
  logger.log('Phase 5: Debug - parseManifestNamesFromMetadata - final manifestNames:', manifestNames);
  return manifestNames;
}

// Function to check if promo is enabled
export function isPromoEnabled(request: any): boolean {
  // Manual query parameter parsing for Akamai
  const queryString = request.query || '';
  const queryParams = new Map();
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        queryParams.set(key, decodeURIComponent(value));
      }
    });
  }
  
  const promoParam = queryParams.get('promo');
  if (promoParam === 'off') return false;
  
  const manifestNames = parseManifestNames(request);
  return Object.keys(manifestNames).length > 0;
}
