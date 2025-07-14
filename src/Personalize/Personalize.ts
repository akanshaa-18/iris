import { AuthState } from "../Auth/Auth";
import { determineLocale } from "../main";

export type PersonalizationData = {
  requestId: string;
  handle: Array<
    | IdentityResultHandle
    | ActivationPullHandle
    | PersonalizationDecisionsHandle
    | LocationHintResultHandle
  >;
};

export type IdentityResultHandle = {
  type: "identity:result";
  payload: Array<{
    id: string;
    namespace: {
      code: string;
    };
  }>;
};

export type ActivationPullHandle = {
  type: "activation:pull";
  eventIndex: number;
  payload: Array<{
    type: string;
    destinationId: string;
    alias: string;
    segments: Array<{
      id: string;
      namespace: string;
    }>;
  }>;
};

export type PersonalizationDecisionsHandle = {
  type: "personalization:decisions";
  eventIndex: number;
  payload: Array<{
    id: string;
    scope: string;
    scopeDetails: {
      decisionProvider: string;
      activity: {
        id: string;
      };
      experience: {
        id: string;
      };
      strategies: Array<{
        step: string;
        trafficType: string;
      }>;
      correlationID: string;
    };
    items: Array<{
      id: string;
      schema: string;
      meta: {
        "experience.id": string;
        "activity.name": string;
        "activity.id": string;
        "option.name": string;
        "experience.name": string;
        "option.id": string;
        "profile.categoryAffinity": string;
        "profile.exlLastProductFeature": string;
        "profile.categoryFavorite": string;
        "offer.name": string;
        "profile.exlLastPageWithProductFeature": string;
        "profile.categoryAffinities": string[];
        "offer.id": string;
        "profile.exlProductsArray": string;
        "profile.twentygroups": string;
      };
      data: {
        id: string;
        format: string;
        content: {
          manifestPath?: string;
          manifestLocation: string;
          manifestContent?: {
            placeholders: {
              total: number;
              offset: number;
              limit: number;
              data: Array<unknown>;
              columns: string[];
            };
            experiences: {
              total: number;
              offset: number;
              limit: number;
              data: Array<{
                action: string;
                selector: string;
              }>;
              columns: string[];
            };
            info: {
              total: number;
              offset: number;
              limit: number;
              data: Array<{
                key: string;
                value: string;
              }>;
              columns: string[];
            };
            ":version": number;
            ":names": string[];
            ":type": string;
          };
        };
      };
    }>;
  }>;
};

export type LocationHintResultHandle = {
  type: "locationHint:result";
  payload: Array<{
    scope: string;
    hint: string;
    ttlSeconds: number;
  }>;
};

type ServiceAccount = {
  serviceCode: string;
  serviceLevel: string;
  serviceStatus: string;
};

type Locale = {
  ietf: string;
  prefix?: string;
};

type RequestPayloadParams = {
  updatedContext: {
    device: {
      screenHeight: number;
      screenWidth: number;
      screenOrientation: string;
    };
    environment: {
      type: string;
      browserDetails: {
        viewportWidth: number;
        viewportHeight: number;
      };
    };
    placeContext: {
      localTime: string;
      localTimezoneOffset: number;
    };
  };
  pageName: string;
  locale: Locale;
  env: string;
  url: URL;
  request: EW.ResponseProviderRequest;
  authState: AuthState;
};

type Cookies = Record<string, string>;

type CookieOptions = {
  expires?: number | Date;
  domain?: string;
};

type VisitorStatusParams = {
  request: EW.ResponseProviderRequest;
  expiryDays?: number;
  cookieName?: string;
  domain?: string;
};

type Profile = {
  serviceAccounts?: ServiceAccount[];
};

export const getPersonalizationData = async (
  request: EW.ResponseProviderRequest,
  authState: AuthState
): Promise<PersonalizationData> => {
  const url = new URL(request.url);
  const env = [
    "stage",
    "dev",
    "test",
    "localhost",
    ".page",
    ".live",
  ].some(str => url.hostname.includes(str)) ? "stage" : "prod";

  const locale = determineLocale(request, url);

  const DATA_STREAM_IDS_PROD = { default: '913eac4d-900b-45e8-9ee7-306216765cd2', business: '0fd7a243-507d-4035-9c75-e42e42f866a0' };
  const DATA_STREAM_IDS_STAGE = { default: 'e065836d-be57-47ef-b8d1-999e1657e8fd', business: '2eedf777-b932-4f2a-a0c5-b559788929bf' };

  let dataStreamId = '';

  function getUrl(requestUrl: string): string {
    const pageUrl = new URL(requestUrl);
    const host = pageUrl.hostname;
    const query = pageUrl.searchParams.get('env');
    const url = `https://edge.adobedc.net/ee/v2/collect`;

    if (query !== null || host.includes('localhost') || host.includes('.page') || host.includes('.live')) {
      return url;
    }

    if (host.includes('stage.adobe') || host.includes('corp.adobe') || host.includes('graybox.adobe')) {
      return `https://www.stage.adobe.com/experienceedge/v2/collect`;
    }

    const origin = pageUrl.origin;
    return `${origin}/experienceedge/v2/collect`;
  }

  const TARGET_API_URL = getUrl(request.url);

  const deviceInfo = {
    screenWidth: 1920,
    screenHeight: 1080,
    screenOrientation: "landscape",
    viewportWidth: 1920,
    viewportHeight: 1080,
  };

  const getLocalISOString = (): string => {
    const date = new Date();
    const padStart = (string: string | number, targetLength: number, padString: string): string => (`${string}`).padStart(targetLength, padString);
    const YYYY = date.getFullYear();
    const MM = padStart(date.getMonth() + 1, 2, '0');
    const DD = padStart(date.getDate(), 2, '0');
    const hh = padStart(date.getHours(), 2, '0');
    const mm = padStart(date.getMinutes(), 2, '0');
    const ss = padStart(date.getSeconds(), 2, '0');
    const mmm = padStart(date.getMilliseconds(), 3, '0');
    const timezoneOffset = Number(date.getTimezoneOffset()) || 0;
    const ts = timezoneOffset > 0 ? '-' : '+';
    const th = padStart(Math.floor(Math.abs(timezoneOffset) / 60), 2, '0');
    const tm = padStart(Math.abs(timezoneOffset) % 60, 2, '0');
    return `${YYYY}-${MM}-${DD}T${hh}:${mm}:${ss}.${mmm}${ts}${th}:${tm}`;
  };
  const localTime = getLocalISOString();
  const CURRENT_DATE = new Date();
  const timezoneOffset = CURRENT_DATE.getTimezoneOffset();

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

  function getPageNameForAnalytics(): string {
    const { hostname, pathname } = url;
    const urlRegions = Object.fromEntries(['ae_ar', 'ae_en', 'africa', 'apac', 'ar', 'at', 'au', 'be', 'be_en', 'be_fr', 'be_nl',
      'bg', 'br', 'ca', 'ca_es', 'ca_fr', 'ch', 'ch_de', 'ch_fr', 'ch_it', 'cin', 'cis_en', 'cis_ru', 'cl', 'cn', 'co', 'cr', 'cs',
      'cs_cz', 'cy', 'cy_en', 'cz', 'da', 'da_dk', 'de', 'de_de', 'dk', 'ec', 'ee', 'eeurope', 'eg_ar', 'eg_en', 'en', 'en_gb',
      'en_us', 'es', 'es_es', 'eu_es', 'fi', 'fi_fi', 'fr', 'fr_fr', 'gr', 'gr_el', 'gr_en', 'gt', 'hk', 'hk_en', 'hk_zh', 'hr',
      'hr_hr', 'hu', 'hu_hu', 'id_en', 'id_id', 'ie', 'il', 'il_en', 'il_he', 'in', 'in_hi', 'it', 'it_it', 'ja', 'ja_jp', 'jp',
      'ko', 'ko_kr', 'kr', 'kw_ar', 'kw_en', 'la', 'lt', 'lu', 'lu_de', 'lu_en', 'lu_fr', 'lv', 'mena', 'mena_ar', 'mena_en',
      'mena_fr', 'mt', 'mx', 'my_en', 'my_ms', 'na', 'nb', 'nb_no', 'ng', 'nl', 'nl_nl', 'no', 'nz', 'pe', 'ph_en', 'ph_fil',
      'pl', 'pl_pl', 'pr', 'pt', 'pt_br', 'qa_ar', 'qa_en', 'ro', 'ro_ro', 'rs', 'ru', 'ru_ru', 'sa_ar', 'sa_en', 'se', 'sea',
      'sg', 'si', 'sk', 'sk_sk', 'sl_si', 'sv', 'sv_se', 'th', 'th_en', 'th_th', 'tr', 'tr_tr', 'tw', 'tw_cn', 'ua', 'uk', 'uk_ua',
      'us', 'vn_en', 'vn_vi', 'za', 'zh-Hans', 'zh-Hant', 'zh-tw', 'zh_cn', 'zh_tw'].map((r) => [r, 1]));

    const path = pathname.replace(/\.(aspx|php|html)/g, '').split('/').filter((s: string) => s !== '' && !urlRegions[s.toLowerCase()]).join(':');
    return `${hostname.replace('www.', '')}${path !== '' ? `:${path}` : ''}`;
  }

  const pageName = getPageNameForAnalytics();

  const requestBody = createRequestPayload({
    updatedContext,
    pageName,
    locale,
    env,
    url,
    request,
    authState,
  });

  if (url.hostname.includes('business.adobe')) {
    dataStreamId = DATA_STREAM_IDS_PROD.business;
  } else if (
    url.hostname.includes('business.stage.adobe')
    || url.hostname.includes('bacom--adobecom.hlx')
    || url.hostname.includes('bacom--adobecom.aem')
  ) {
    dataStreamId = DATA_STREAM_IDS_STAGE.business;
  } else {
    dataStreamId = env === 'prod' ? DATA_STREAM_IDS_PROD.default : DATA_STREAM_IDS_STAGE.default;
  }

  const targetResp = await fetch(`${TARGET_API_URL}?dataStreamId=${dataStreamId}&requestId=${generateUUIDv4()}`, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  if (!targetResp.ok) {
    throw new Error(`Failed to fetch personalization data: ${targetResp.status} ${targetResp.statusText}`);
  }

  return await targetResp.json() as PersonalizationData;
};

type RequestPayload = {
  event: {
    xdm: {
      device: {
        screenHeight: number;
        screenWidth: number;
        screenOrientation: string;
      };
      environment: {
        type: string;
        browserDetails: {
          viewportWidth: number;
          viewportHeight: number;
        };
      };
      placeContext: {
        localTime: string;
        localTimezoneOffset: number;
      };
      identityMap: Record<string, Array<{ 
        id: string; 
        authenticatedState: string; 
        primary: boolean 
      }>>;
      web: {
        webPageDetails: {
          URL: string;
          siteSection: string;
          server: string;
          isErrorPage: boolean;
          isHomePage: boolean;
          name: string;
          pageViews: { value: number };
        };
        webInteraction: {
          name: string;
          type: string;
          linkClicks: { value: number };
        };
        webReferrer: { URL: string };
      };
      timestamp: string;
      eventType: string;
    };
    data: {
      __adobe: {
        target: {
          is404: boolean;
          authState: string;
          hitType: string;
          isMilo: boolean;
          adobeLocale: string;
          hasGnav: boolean;
        };
      };
      _adobe_corpnew: {
        marketingtech: { adobe: { alloy: { approach: string } } };
        digitalData: {
          page: { pageInfo: { language: string } };
          diagnostic: { franklin: { implementation: string } };
          previousPage: { pageInfo: { pageName: string | undefined } };
          primaryUser: { primaryProfile: { profileInfo: unknown } };
        };
      };
    };
  };
  query: {
    identity: { fetch: string[] };
    personalization: {
      schemas: string[];
      decisionScopes: string[];
    };
  };
  meta: {
    target: { migration: boolean };
    configOverrides: {
      com_adobe_analytics: { reportSuites: string[] };
      com_adobe_target: { propertyToken: string };
    };
    state: {
      domain: string;
      cookiesEnabled: boolean;
      entries: Array<{ key: string; value: string }>;
    };
  };
};

function createRequestPayload({ 
  updatedContext, 
  pageName, 
  locale, 
  env, 
  url, 
  request, 
  authState, 
}: RequestPayloadParams): RequestPayload {
  const cookieHeader = request.getHeaders()["Cookie"]?.[0] ?? "";
  const cookies: Cookies = {};

  if (cookieHeader && cookieHeader !== '') {
    cookieHeader.split(";").forEach((cookie: string) => {
      const parts = cookie.trim().split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join("=").trim();
        cookies[key] = value;
      }
    });
  }
  
  const prevPageName = cookies['gpv'];

  const AT_PROPERTY_VAL = getTargetPropertyBasedOnPageRegion({ 
    env, 
    pathname: url.pathname 
  });
  const REPORT_SUITES_ID = env === "prod" ? ["adbadobenonacdcprod"] : ["adbadobenonacdcqa"];

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
            "URL": request.getHeaders()["Referer"]?.[0] ?? ""
          }
        },
        "timestamp": new Date().toISOString(),
        "eventType": "decisioning.propositionFetch",
      },
      "data": {
        "__adobe": {
          "target": {
            "is404": false,
            "authState": "loggedOut",
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
                "profileInfo": (authState as { data: unknown }).data ?? {},
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

function getTargetPropertyBasedOnPageRegion({ 
  env, 
  pathname 
}: { 
  env: string; 
  pathname: string 
}): string {
  if (env !== 'prod') return 'bc8dfa27-29cc-625c-22ea-f7ccebfc6231';

  // EMEA & LATAM
  if (
    pathname.search(
      /(\/africa\/|\/be_en\/|\/be_fr\/|\/be_nl\/|\/cis_en\/|\/cy_en\/|\/dk\/|\/de\/|\/ee\/|\/es\/|\/fr\/|\/gr_en\/|\/ie\/|\/il_en\/|\/it\/|\/lv\/|\/lu_de\/|\/lu_en\/|\/lu_fr\/|\/hu\/|\/mt\/|\/mena_en\/|\/nl\/|\/no\/|\/pl\/|\/pt\/|\/ro\/|\/ch_de\/|\/si\/|\/sk\/|\/ch_fr\/|\/fi\/|\/se\/|\/ch_it\/|\/tr\/|\/uk\/|\/at\/|\/cz\/|\/bg\/|\/ru\/|\/cis_ru\/|\/ua\/|\/il_he\/|\/mena_ar\/|\/lt\/|\/sa_en\/|\/ae_en\/|\/ae_ar\/|\/sa_ar\/|\/ng\/|\/za\/|\/qa_ar\/|\/eg_en\/|\/eg_ar\/|\/kw_ar\/|\/eg_ar\/|\/qa_en\/|\/kw_en\/|\/gr_el\/|\/br\/|\/cl\/|\/la\/|\/mx\/|\/co\/|\/ar\/|\/pe\/|\/gt\/|\/pr\/|\/ec\/|\/cr\/)/,
    ) !== -1
  ) {
    return '488edf5f-3cbe-f410-0953-8c0c5c323772';
  }
  if ( // APAC
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
function getOrGenerateUserId(cookies: Cookies): Record<string, Array<{ 
  id: string; 
  authenticatedState: string; 
  primary: boolean 
}>> {
  // If ECID is not found, generate and return FPID
  if (!cookies[AMCV_COOKIE] || (cookies[AMCV_COOKIE].indexOf('MCMID|') === -1)) {
    const fpidValue = generateUUIDv4();
    return {
      FPID: [{
        id: fpidValue,
        authenticatedState: 'ambiguous',
        primary: true,
      }],
    };
  }

  const ecidMatch = cookies[AMCV_COOKIE].match(/MCMID\|([^|]+)/);
  const ecid = ecidMatch?.[1];
  
  return {
    ECID: [{
      id: ecid ?? '',
      authenticatedState: 'ambiguous',
      primary: true,
    }],
  };
}

function generateUUIDv4(): string {
  const randomValues = new Uint8Array(16);
  crypto.getRandomValues(randomValues);
  randomValues[6] = (randomValues[6] % 16) + 64;
  randomValues[8] = (randomValues[8] % 16) + 128;
  let uuid = '';
  randomValues.forEach((byte, index) => {
    const hex = byte.toString(16).padStart(2, '0');
    if (index === 4 || index === 6 || index === 8 || index === 10) {
      uuid += '-';
    }
    uuid += hex;
  });

  return uuid;
}

interface Sha256Function {
  (b: string): string;
  h: number[];
  k: number[];
}

export const sha256: Sha256Function = function (b: string): string {
  function c(a: number, b: number): number {
    return (a >>> b) | (a << (32 - b));
  }
  
  if (sha256.h.length === 0) {
    sha256.h = [];
  }
  if (sha256.k.length === 0) {
    sha256.k = [];
  }
  
  const g = 2 ** 32;
  const j: number[] = [];
  const k = 8 * b.length;
  let l = sha256.h;
  const m = sha256.k;
  let n = m.length;
  const o: Record<number, number> = {};
  
  for (let p = 2; n < 64; p++) {
    if (!o[p]) {
      for (let d = 0; d < 313; d += p) o[d] = p;
      l[n] = p ** 0.5 * g | 0;
      m[n++] = p ** (1 / 3) * g | 0;
    }
  }
  
  for (b += '\x80'; b.length % 64 - 56;) b += '\x00';
  
  for (let d = 0; d < b.length; d++) {
    const e = b.charCodeAt(d);
    if (e >> 8) return '';
    j[d >> 2] |= e << ((3 - d) % 4) * 8;
  }
  
  j[j.length] = k / g | 0;
  j[j.length] = k;
  
  for (let e = 0; e < j.length;) {
    const q = j.slice(e, (e += 16));
    const r = l;
    l = l.slice(0, 8);
    for (let d = 0; d < 64; d++) {
      const s = q[d - 15];
      const t = q[d - 2];
      const u = l[0];
      const v = l[4];
      const w = l[7] + (c(v, 6) ^ c(v, 11) ^ c(v, 25)) + 
        ((v & l[5]) ^ (~v & l[6])) + m[d] + 
        (q[d] = d < 16 ? q[d] : 
          (q[d - 16] + (c(s, 7) ^ c(s, 18) ^ (s >>> 3)) + 
           q[d - 7] + (c(t, 17) ^ c(t, 19) ^ (t >>> 10))) | 0);
      const x = (c(u, 2) ^ c(u, 13) ^ c(u, 22)) + 
        ((u & l[1]) ^ (u & l[2]) ^ (l[1] & l[2]));
      l = [w + x | 0].concat(l);
      l[4] = l[4] + w | 0;
    }
    for (let d = 0; d < 8; d++) l[d] = l[d] + r[d] | 0;
  }
  
  let i = '';
  for (let d = 0; d < 8; d++) {
    for (let e = 3; e + 1; e--) {
      const y = (l[d] >> (8 * e)) & 255;
      i += (y < 16 ? 0 : '') + y.toString(16);
    }
  }
  return i;
} as Sha256Function;

sha256.h = [];
sha256.k = [];

function setCookie(
  domain: string, 
  key: string, 
  value: string, 
  options: CookieOptions = {}
): string {
	const expires = options.expires;
	const date = new Date();
	
	const expiresInDays = typeof expires === 'number' ? expires : 730;
	date.setTime(date.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
	
	const expiresString = `expires=${date.toUTCString()}`;

	const cookie = `${key}=${value}; ${expiresString}; path=/ ; domain=.${domain};`;
	return cookie;
}

type VisitorStatusResult = {
  visitorStatus: string;
  cookie: string;
};

export const getVisitorStatus = ({
	request,
	expiryDays = 30,
	cookieName = 's_nr',
  domain,
}: VisitorStatusParams): VisitorStatusResult => {
	const currentTime = Date.now();

  const cookieHeader = request.getHeaders()["Cookie"]?.[0] ?? "";
  const cookies: Cookies = {};

  if (cookieHeader && cookieHeader !== '') {
    cookieHeader.split(";").forEach((cookie: string) => {
      const parts = cookie.trim().split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join("=").trim();
        cookies[key] = value;
      }
    });
  }
  
	const cookieValue = cookies[cookieName];
	let visitorStatus: string;
	let cookie: string;

	const cookieAttributes: { expires: Date; domain?: string } = { 
    expires: new Date(currentTime + expiryDays * 24 * 60 * 60 * 1000) 
  };

	if (domain !== null && domain !== undefined && domain !== '') {
	  cookieAttributes.domain = domain;
	}

	if (!cookieValue) {
	  cookie = setCookie(domain ?? '', cookieName, `${currentTime}-New`, cookieAttributes);
	  visitorStatus = 'New';
	}

	const [storedTime, storedState] = cookieValue.split('-').map((value: string) => value.trim());

	if (currentTime - parseInt(storedTime) < 30 * 60 * 1000 && storedState === 'New') {
		cookie = setCookie(domain ?? '', cookieName, `${currentTime}-New`, cookieAttributes);
		visitorStatus = 'New';
	}

	cookie = setCookie(domain ?? '', cookieName, `${currentTime}-Repeat`, cookieAttributes);
	visitorStatus = 'Repeat';

	return {
		visitorStatus,
		cookie,
	};
};

const LOCALE_MAPPINGS = {
  '': 'en-US', ar: 'es-AR', br: 'pt-BR', ca: 'en-CA', ca_fr: 'fr-CA', cl: 'es-CL', co: 'es-CO', la: 'es-LA', mx: 'es-MX', pe: 'es-PE', africa: 'en-AFRICA', be_fr: 'fr-BE', be_en: 'en-BE', be_nl: 'nl-BE', cy_en: 'en-CY', dk: 'da-DK', de: 'de-DE', ee: 'et-EE', es: 'es-ES', fr: 'fr-FR', gr_en: 'en-GR', ie: 'en-IE', il_en: 'en-IL', it: 'it-IT', lv: 'lv-LV', lt: 'lt-LT', lu_de: 'de-LU', lu_en: 'en-LU', lu_fr: 'fr-LU', hu: 'hu-HU', mt: 'en-MT', mena_en: 'en-MENA', nl: 'nl-NL', no: 'no-NO', pl: 'pl-PL', pt: 'pt-PT', ro: 'ro-RO', sa_en: 'en-SA', ch_de: 'de-CH', si: 'sl-SI', sk: 'sk-SK', ch_fr: 'fr-CH', fi: 'fi-FI', se: 'sv-SE', ch_it: 'it-CH', tr: 'tr-TR', ae_en: 'en-AE', uk: 'en-UK', at: 'de-AT', cz: 'cs-CZ', bg: 'bg-BG', ru: 'ru-RU', ua: 'uk-UA', il_he: 'iw-IL', ae_ar: 'ar-AE', mena_ar: 'ar-MENA', sa_ar: 'ar-SA', au: 'en-AU', hk_en: 'en-HK', in: 'en-IN', id_id: 'in-ID', id_en: 'en-ID', my_ms: 'ms-MY', my_en: 'en-MY', nz: 'en-NZ', ph_en: 'en-PH', ph_fil: 'fil-PH', sg: 'en-SG', th_en: 'en-TH', in_hi: 'hi-IN', th_th: 'th-TH', cn: 'zh-CN', hk_zh: 'zh-HK', tw: 'zh-hant-TW', jp: 'ja-JP', kr: 'ko-KR', langstore: 'en-US', za: 'en-ZA', ng: 'en-NG', cr: 'es-CR', ec: 'es-EC', pr: 'es-PR', gt: 'es-GT', eg_ar: 'ar-EG', kw_ar: 'ar-KW', qa_ar: 'ar-QA', eg_en: 'en-EG', kw_en: 'en-KW', qa_en: 'en-QA', gr_el: 'el-GR', vn_en: 'en-VN', vn_vi: 'vi-VN', cis_ru: 'ru-CIS', cis_en: 'en-CIS',
};

export function getLanguageCode(locale: Locale): string {
  const prefix = locale?.prefix?.replace(/^\//, '') ?? '';
  return LOCALE_MAPPINGS[prefix as keyof typeof LOCALE_MAPPINGS] ?? LOCALE_MAPPINGS[''];
}
  
export function getEntitlementCreativeCloud(
  profile: Profile, 
  scope: string
): string {
	if (
	  scope
	  && scope.indexOf('creative_cloud') !== -1
	  && profile.serviceAccounts
	) {
      const serviceAccount: ServiceAccount | undefined = 
        profile.serviceAccounts.find(
          (sa: ServiceAccount) => sa.serviceCode === 'creative_cloud',
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

export function getEntitlementStatusCreativeCloud(
  profile: Profile, 
  scope: string
): string {
	if (
	  scope
	  && scope.indexOf('creative_cloud') !== -1
	  && profile.serviceAccounts
	) {
	  const serviceAccount = profile.serviceAccounts.find(
		(sa: ServiceAccount) => sa.serviceCode === 'creative_cloud',
	  );
	  return serviceAccount?.serviceStatus ?? 'none';
	}
	return 'none';
}
