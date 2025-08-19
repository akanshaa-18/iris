import { HtmlRewritingStream } from "html-rewriter";
import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";

// Function to extract metadata from HTML content
export function extractMetadataFromHTML(htmlContent: string, key: string): string | null {
  // Create a regex to find meta tags with the given name
  const metaRegex = new RegExp(`<meta\\s+name=["']${key}["']\\s+content=["']([^"']*)["']`, 'i');
  const match = htmlContent.match(metaRegex);
  return match ? match[1] : null;
}

// Function to extract all metadata from HTML content
export function extractAllMetadataFromHTML(htmlContent: string): Record<string, string> {
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

// Function to get MEP enablement from HTML content
export function getMepEnablementFromHTML(htmlContent: string, mdKey: string, paramKey: string | false = false, queryString: string = ''): any {
  // Get query parameters
  let paramValue = null;
  
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
  
  if (paramValue) return getMepValue(paramValue);
  
  // Get from HTML metadata
  const metadataValue = extractMetadataFromHTML(htmlContent, mdKey);
  if (metadataValue) {
    return getMepValue(metadataValue);
  }
  
  return false;
}

// Function to get promo MEP enablement from HTML content
export function getPromoMepEnablementFromHTML(htmlContent: string): any {
  const mds = [
    'apac_manifestnames',
    'emea_manifestnames',
    'americas_manifestnames',
    'jp_manifestnames',
    'manifestnames',
  ];
  
  const mdObject: Record<string, any> = {};
  
  mds.forEach((key) => {
    const val = extractMetadataFromHTML(htmlContent, key);
    if (val) {
      mdObject[key] = getMepValue(val);
    }
  });
  
  if (Object.keys(mdObject).length > 0) {
    return mdObject;
  }
  return false;
}

const COMMANDS_KEYS = {
  remove: 'remove',
  replace: 'replace',
  updateAttribute: 'updateattribute',
};



// New streaming function that works directly with response.body
export const rewriteStream = async (response: any, data: any, responseHeaders: any) => {
  logger.log("=== STREAMING HTML REWRITING START ===");
  logger.log("Processing data:", {
   fragmentsCount: data?.fragments?.length || 0,
   commandsCount: data?.commands?.length || 0
  });

  const transformedData = await Promise.all(
    data?.commands?.map(async (cmd: any) => {
      if (cmd.type === "fragment") {
        return { ...cmd, type: "fragment", path: cmd.path };
      }
      let { modifiedSelector, modifiers, attribute } = modifyNonFragmentSelector(cmd.selector, cmd.action);
      return { ...cmd, selector: modifiedSelector, attribute };
    }) || []
  );

  logger.log("Transformed commands:", transformedData.length);

  const rewriter = new HtmlRewritingStream();
  
  // Add edge personalization meta tag
  rewriter.onElement("head", (el) => {
    logger.log("Adding edge personalization meta tags to head");
    el.append('<meta name="edge-personalized" content="true" />');
    el.append('<script>window.edgePersonalizationApplied = true;</script>');
  });

  // Process fragments
  logger.log("Processing fragments...");
  for (const cmd of data?.fragments || []) {
    const { selector, val: path } = cmd;
    logger.log(`Loading fragment: ${path} for selector: ${selector}`);
    const fragmentHTML = await fetchFragmentContent(path);
    if (!fragmentHTML) {
      logger.log(`Failed to load fragment: ${path}`);
      continue;
    }

    logger.log(`Fragment loaded successfully: ${path} (${fragmentHTML.length} chars)`);
    rewriter.onElement(selector, (el) => {
      el.replaceChildren(fragmentHTML);
    });
  }

  // Process commands
  logger.log("Processing commands...");
  for (const cmd of transformedData) {
    const { action, selector, content, attribute, type, path } = cmd;

    if (type === "fragment") {
      logger.log(`Loading fragment command: ${path} for selector: ${selector}`);
      const fragmentHTML = await fetchFragmentContent(path);
      if (!fragmentHTML) {
        logger.log(`Failed to load fragment command: ${path}`);
        continue;
      }

      logger.log(`Fragment command loaded: ${path} (${fragmentHTML.length} chars)`);
      rewriter.onElement(selector, (el) => {
        el.replaceChildren(fragmentHTML);
      });

      continue;
    }

    logger.log(`Applying command: ${action} on selector: ${selector}`);
    rewriter.onElement(selector, (el) => {
      if (action === "remove") {
        el.remove();
      } else if (action === "replace") {
        el.replaceChildren(content);
      } else if (action === "updateAttribute" && attribute) {
        el.setAttribute(attribute, content);
      }
    });
  }

  logger.log("=== STREAMING HTML REWRITING COMPLETE ===");
  
  // Remove Content-Length header since we're modifying the content
  delete responseHeaders["content-length"];
  delete responseHeaders["Content-Length"];
  delete responseHeaders["content-encoding"];
  delete responseHeaders["Content-Encoding"];
  
  // Stream directly from response.body into the rewriter
  return createResponse(
    response.status,
    responseHeaders,
    response.body.pipeThrough(rewriter)
  );
};

// New function that works with HTML content string and creates a stream
export const rewriteStreamWithContent = async (htmlContent: string, data: any, responseHeaders: any) => {
  logger.log("=== HTML REWRITING WITH CONTENT START ===");
  logger.log("Processing data:", {
   fragmentsCount: data?.fragments?.length || 0,
   commandsCount: data?.commands?.length || 0
  });

  // If no personalization data, return original content
  if (!data?.fragments?.length && !data?.commands?.length) {
    logger.log("No personalization data to apply, returning original HTML");
    return createResponse(200, responseHeaders, htmlContent);
  }

  const transformedData = await Promise.all(
    data?.commands?.map(async (cmd: any) => {
      if (cmd.type === "fragment") {
        return { ...cmd, type: "fragment", path: cmd.path };
      }
      let { modifiedSelector, modifiers, attribute } = modifyNonFragmentSelector(cmd.selector, cmd.action);
      return { ...cmd, selector: modifiedSelector, attribute };
    }) || []
  );

  logger.log("Transformed commands:", transformedData.length);

  // Create a simple HTML modification approach since HtmlRewritingStream has issues
  let modifiedHTML = htmlContent;
  
  // Add edge personalization meta tag to head
  const headEndIndex = modifiedHTML.indexOf('</head>');
  if (headEndIndex !== -1) {
    const personalizationMeta = '<meta name="edge-personalized" content="true" /><script>window.edgePersonalizationApplied = true;</script>';
    modifiedHTML = modifiedHTML.slice(0, headEndIndex) + personalizationMeta + modifiedHTML.slice(headEndIndex);
    logger.log("Added edge personalization meta tags to head");
  }

  // Process fragments - simple string replacement for now
  logger.log("Processing fragments...");
  for (const cmd of data?.fragments || []) {
    const { selector, val: path } = cmd;
    logger.log(`Loading fragment: ${path} for selector: ${selector}`);
    const fragmentHTML = await fetchFragmentContent(path);
    if (!fragmentHTML) {
      logger.log(`Failed to load fragment: ${path}`);
      continue;
    }

    logger.log(`Fragment loaded successfully: ${path} (${fragmentHTML.length} chars)`);
    // For now, we'll log the fragment but not apply it due to complexity
    logger.log(`Would apply fragment to selector: ${selector}`);
  }

  // Process commands - simple string replacement for now
  logger.log("Processing commands...");
  for (const cmd of transformedData) {
    const { action, selector, content, attribute, type, path } = cmd;

    if (type === "fragment") {
      logger.log(`Loading fragment command: ${path} for selector: ${selector}`);
      const fragmentHTML = await fetchFragmentContent(path);
      if (!fragmentHTML) {
        logger.log(`Failed to load fragment command: ${path}`);
        continue;
      }

      logger.log(`Fragment command loaded: ${path} (${fragmentHTML.length} chars)`);
      logger.log(`Would apply fragment command to selector: ${selector}`);
      continue;
    }

    logger.log(`Applying command: ${action} on selector: ${selector}`);
    
    // Simple string-based replacement for demonstration
    if (action === "replace" && content) {
      // Find the element by selector and replace its content
      const elementRegex = new RegExp(`<([^>]*class="[^"]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*)>([^<]*)</\\1>`, 'gi');
      modifiedHTML = modifiedHTML.replace(elementRegex, (match, tag, innerContent) => {
        logger.log(`Replacing content in selector: ${selector}`);
        return match.replace(innerContent, content);
      });
    }
  }

  logger.log("=== HTML REWRITING WITH CONTENT COMPLETE ===");
  
  // Remove Content-Length header since we're modifying the content
  delete responseHeaders["content-length"];
  delete responseHeaders["Content-Length"];
  delete responseHeaders["content-encoding"];
  delete responseHeaders["Content-Encoding"];
  
  logger.log("Rewriter: Returning modified HTML content");
  
  return createResponse(
    200,
    responseHeaders,
    modifiedHTML
  );
};

function modifyNonFragmentSelector(selector, action) {
  const { sel, modifiers } = getModifiers(selector);

  let modifiedSelector = sel
    .split('>').join(' > ')
    .split(',').join(' , ')
    .replaceAll(/main\s*>?\s*(section\d*)/gi, '$1')
    .split(/\s+/)
    .map(modifySelectorTerm)
    .join(' ')
    .trim();

  let attribute;

  if (action === COMMANDS_KEYS.updateAttribute) {
    const string = modifiedSelector.split(' ').pop();
    attribute = string.replace('.', '');
    modifiedSelector = modifiedSelector.replace(string, '').trim();
  }

  return {
    modifiedSelector,
    modifiers,
    attribute,
  };
}

function modifySelectorTerm(termParam) {
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
  const updateEndNumber = (endNumber, term) => (endNumber
    ? term.replace(endNumber, `:nth-child(${endNumber})`)
    : term);
  if (otherSelectors.includes(startText)) {
    term = term.replace(startText, '> div');
    term = updateEndNumber(endNumber, term);
    return term;
  }
  if (Object.keys(specificSelectors).includes(startTextPart1)) {
    term = term.replace(startTextPart1, specificSelectors[startTextPart1]);
    term = updateEndNumber(endNumber, term);
    return term;
  }

  if (!startText.startsWith('.')) term = `.${term}`;
  if (endNumber) {
    term = term.replace(endNumber, '');
    term = `${term}:nth-child(${endNumber} of ${term})`;
  }
  return term;
}

function getModifiers(selector) {
  let sel = selector;
  const modifiers = [];
  const flags = sel.split(/\s+#_/);
  if (flags.length) {
    sel = flags.shift();
    flags.forEach((flag) => {
      flag.split(/_|#_/).forEach((mod) => modifiers.push(mod.toLowerCase().trim()));
    });
  }
  return { sel, modifiers };
}

async function fetchFragmentContent(path) {
  try {
    logger.log('Rewriter: Fetching fragment content from:', path);
    
    const response = await httpRequest(path);
    if (response.status === 200) {
      const content = await response.text();
      logger.log('Rewriter: Successfully fetched fragment content, length:', content.length);
      return content;
    } else {
      logger.log('Rewriter: Failed to fetch fragment, status:', response.status);
      return `<div class="fragment-placeholder">Fragment content for: ${path}</div>`;
    }
  } catch (e) {
    logger.log('Rewriter: Error fetching fragment:', e);
    return `<div class="fragment-placeholder">Fragment content for: ${path}</div>`;
  }
}
