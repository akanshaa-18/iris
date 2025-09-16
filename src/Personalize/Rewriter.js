import { HtmlRewritingStream } from "html-rewriter";
import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";
import { TextEncoder } from "encoding";
import { ReadableStream } from "streams";
import { normalizePath, replacePlaceholders } from "./ManifestUtils.js";

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

// Rewrite HTML using buffered response (most efficient approach)
export const rewriteWithBufferedHtml = async (bufferedHtml, data, responseHeaders, status) => {
  // Transform commands for processing (like client-side handleCommands)
  const transformedData = await Promise.all(
    data?.commands?.map(async (cmd) => {
      // Check if this is a fragment command (like client-side getSelectorType)
      const isFragmentContent = cmd.content && (cmd.content.startsWith('/') || cmd.content.startsWith('http'));
      
      if (isFragmentContent) {
        // This is a fragment command (like client-side fragment processing)
        return { 
          ...cmd, 
          type: "fragment", 
          path: cmd.content,
          selector: cmd.selector 
        };
      }
      
      // Regular command processing
      let { modifiedSelector, modifiers, attribute } = modifyNonFragmentSelector(cmd.selector, cmd.action);
      return { ...cmd, selector: modifiedSelector, attribute };
    }) || []
  );

  const rewriter = new HtmlRewritingStream();
  
  // Add edge personalization meta tag
  rewriter.onElement("head", (el) => {
    el.append('<meta name="edge-personalized" content="true" />');
    el.append('<script>window.edgePersonalizationApplied = true;</script>');
  });

  // Process global placeholders in original HTML content (like client-side decoratePlaceholders)
  if (data?.placeholders && Object.keys(data.placeholders).length > 0) {
    const processedHtml = replacePlaceholders(bufferedHtml, data.placeholders);
    if (processedHtml !== bufferedHtml) {
      bufferedHtml = processedHtml;
    }
  }

  // Process commands (like client-side handleCommands) - this handles both commands AND fragments together
  for (const cmd of transformedData) {
    const { action, selector, content, attribute, type, path } = cmd;

    // Skip commands that contain #modal-hash (modal-related commands)
    if (content && content.includes('#modal-hash')) {
      logger.log(`🔍 Skipping modal command: action="${action}", selector="${selector}"`);
      continue;
    }

    // Handle fragment commands (like client-side getSelectedElements for fragments)
    if (type === "fragment") {
      // Apply the same selector transformation as regular commands (like client-side modifyNonFragmentSelector)
      let { modifiedSelector, modifiers, attribute } = modifyNonFragmentSelector(selector, action);
      
      const fragmentHTML = await fetchFragmentContent(path);
      if (!fragmentHTML) {
        logger.log(`No fragment HTML found for path: ${path}`);
        continue;
      }

      // Process fragment content like client-side: parse, extract sections, create fragment structure
      let processedFragmentHTML = await processFragmentContent(fragmentHTML, path, data?.placeholders || {});
      const fragmentWrapper = processedFragmentHTML;
      
      logger.log(`Final processed fragment content (first 1000 chars): ${processedFragmentHTML.substring(0, 1000)}...`);
      
      // Use HTML Rewriter to replace elements (like client-side a.parentElement.replaceChild(fragment, a))
      rewriter.onElement(modifiedSelector, (el) => {
        // Replace the element with the wrapped fragment content
        el.replaceWith(fragmentWrapper);
        logger.log(`Fragment content applied using HTML Rewriter to selector: "${modifiedSelector}"`);
      });
      
      continue;
    }

    // Track if we've already processed the first element for this selector (like client-side behavior)
    let isFirstElement = true;
    
    rewriter.onElement(selector, (el) => {
      // Only process the first matching element (like client-side getSelectedElements)
      if (!isFirstElement) {
        return;
      }
      isFirstElement = false;
      
      if (action === "remove") {
        // Handle remove action (like client-side COMMANDS.remove)
        const classAttr = el.getAttribute("class") || "";
        if (content !== 'false') {
          el.setAttribute("class", classAttr + " p13n-deleted");
        }
        // Note: In Akamai HTML Rewriter, we can't remove elements directly
        // The p13n-deleted class will be used for styling/identification
        
      } else if (action === "replace") {
        // Handle replace action (like client-side COMMANDS.replace)
        const classAttr = el.getAttribute("class") || "";
        if (!classAttr.split(/\s+/).includes("p13n-replaced")) {
          
          // Check if content is a fragment (like client-side createContent)
          const isFragment = content && (content.startsWith('/') || content.startsWith('http'));
          
          if (isFragment) {
            // For fragments: create link element (like client-side createFrag)
            const processedContent = replacePlaceholders(content, data?.placeholders || {});
            const fragmentHTML = createFragmentHTML(processedContent, el);
            const newContentHTML = createContentElement(fragmentHTML, cmd, data?.placeholders || {});
            
            // Insert BEFORE element (like client-side insertAdjacentElement('beforebegin'))
            el.before(newContentHTML);
          } else {
            // For non-fragments: replace content directly (like client-side innerHTML)
            const processedContent = replacePlaceholders(content, data?.placeholders || {});
            el.replaceChildren(processedContent);
          }
          
          el.setAttribute("class", classAttr + " p13n-replaced");
        }
        
      } else if (action === "updateAttribute" && attribute) {
        // Handle updateAttribute action (like client-side COMMANDS.updateAttribute)
        const processedContent = replacePlaceholders(content, data?.placeholders || {});
        el.setAttribute(attribute, processedContent);
        
        // Add IDs if available
        if (cmd.manifestId || cmd.targetManifestId) {
          addIds(el, cmd.manifestId || '', cmd.targetManifestId || '');
        }
        
      } else if (action in CREATE_CMDS) {
        // Handle CREATE_CMDS actions (like client-side CREATE_CMDS)
        const insertPosition = CREATE_CMDS[action];
        const processedContent = replacePlaceholders(content, data?.placeholders || {});
        
        // Check if content is a fragment (like client-side createContent)
        const isFragment = content && (content.startsWith('/') || content.startsWith('http'));
        
        let newContentHTML;
        if (isFragment) {
          // For fragments: create link element (like client-side createFrag)
          const fragmentHTML = createFragmentHTML(processedContent, el);
          newContentHTML = createContentElement(fragmentHTML, cmd, data?.placeholders || {});
        } else {
          // For non-fragments: create div with content (like client-side createContent)
          newContentHTML = createContentElement(processedContent, cmd, data?.placeholders || {});
        }
        
        // Use appropriate method based on insert position (like client-side insertAdjacentElement)
        if (insertPosition === 'beforebegin') {
          el.before(newContentHTML);
        } else if (insertPosition === 'afterend') {
          el.after(newContentHTML);
        } else if (insertPosition === 'afterbegin') {
          el.prepend(newContentHTML);
        } else if (insertPosition === 'beforeend') {
          el.append(newContentHTML);
        }
        
        // Note: IDs are already included in the HTML string from createContentElement
      }
    });
  
  }

  // Clean up marked elements (like client-side deleteMarkedEls)
  cleanupMarkedElements(rewriter);

  logger.log("=== HTML REWRITING COMPLETE (Buffered Mode) ===");
  
  // Remove Content-Length header since we're modifying the content
  delete responseHeaders["content-length"];
  delete responseHeaders["Content-Length"];
  
  // Create a ReadableStream from the buffered HTML
  // This allows HtmlRewritingStream to process the HTML efficiently
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(bufferedHtml));
      controller.close();
    }
  });
  
  return createResponse(
    status,
    responseHeaders,
    stream.pipeThrough(rewriter)
  );
};

function modifyNonFragmentSelector(selector, action) {
  if (!selector || selector.trim() === '') {
    logger.log(`Empty selector detected in modifyNonFragmentSelector: "${selector}"`);
    return { modifiedSelector: '', modifiers: [], attribute: null };
  }
  
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
    'action-area': 'em a, strong a', // Fallback for '*:has(> em a, > strong a)'
    'any-marquee-section': 'main > div [class*="marquee"]', // Fallback for 'main > div:has([class*="marquee"])'
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
    // Process path like client-side fragment.js
    let resourcePath = path;
    
    // Handle federal URLs (like client-side fragment.js)
    if (path.includes('/federal/')) {
      // Note: In server-side, we'll use the path as-is since we don't have getFederatedUrl
      // The normalizePath function should handle this appropriately
    }
    
    // Add .plain.html suffix (like client-side fragment.js)
    let plainPath = resourcePath.endsWith('.plain.html') ? resourcePath : `${resourcePath}.plain.html`;
    
    // Remove hash fragments before adding .plain.html (like client-side fragment.js)
    if (plainPath.includes('#')) {
      const [pathWithoutHash] = plainPath.split('#');
      plainPath = pathWithoutHash;
      plainPath = plainPath.endsWith('.plain.html') ? plainPath : `${plainPath}.plain.html`;
    }
    
    // Use normalizePath to handle localization and domain mapping
    const normalizedPath = normalizePath(plainPath, true);
    
    const response = await httpRequest(normalizedPath, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'max-age=300' // Cache for 5 minutes
      }
    });

    if (!response.ok) {
      logger.log(`Failed to fetch fragment ${normalizedPath}: ${response.status}`);
      return null;
    }

    const fragmentContent = await response.text();
    if (!fragmentContent) {
      logger.log(`Empty fragment content for ${normalizedPath}`);
      return null;
    }

    return fragmentContent;
  } catch (error) {
    logger.log(`Error fetching fragment ${path}: ${error}`);
    return null;
  }
}

// Add element IDs (like client-side addIds)
function addIds(el, manifestId, targetManifestId) {
  if (manifestId) el.setAttribute('data-manifest-id', manifestId);
  if (targetManifestId) el.setAttribute('data-adobe-target-testid', targetManifestId);
}

// Clean up marked elements (like client-side deleteMarkedEls)
function cleanupMarkedElements(rewriter) {
  // Remove elements marked with p13n-deleted class
  rewriter.onElement('[class*="p13n-deleted"]', (el) => {
    el.remove();
  });
}

// Process fragment content like client-side fragment.js
async function processFragmentContent(fragmentHTML, fragmentPath, placeholders = {}) {
  try {
    // Step 1: Apply placeholder replacement (like client-side)
    let processedHTML = replacePlaceholders(fragmentHTML, placeholders);
    
    // Step 2: Apply media path replacement (like client-side replaceDotMedia)
    processedHTML = replaceDotMedia(processedHTML, fragmentPath);
    
    // Step 3: Extract sections like client-side (body > div)
    const sections = extractSections(processedHTML);
    
    if (sections.length === 0) {
      logger.log(`No sections found in fragment content for ${fragmentPath}`);
      return processedHTML; // Return original if no sections found
    }
    
    // Step 4: Create fragment structure like client-side
    const fragmentContent = createFragmentStructure(sections, fragmentPath);
    
    logger.log(`Processed fragment content: ${sections.length} sections extracted and structured`);
    return fragmentContent;
    
  } catch (error) {
    logger.log(`Error processing fragment content for ${fragmentPath}: ${error}`);
    return fragmentHTML; // Return original on error
  }
}

// Extract sections from HTML content (like client-side doc.querySelectorAll('body > div'))
function extractSections(html) {
  const sections = [];
  
  // Use regex to find body > div sections (like client-side)
  const bodyDivRegex = /<body[^>]*>([\s\S]*?)<\/body>/i;
  const bodyMatch = html.match(bodyDivRegex);
  
  if (bodyMatch) {
    const bodyContent = bodyMatch[1];
    
    // Find all div elements that are direct children of body
    const divRegex = /<div[^>]*>[\s\S]*?<\/div>/gi;
    let divMatch;
    
    while ((divMatch = divRegex.exec(bodyContent)) !== null) {
      // Check if this div is a direct child of body (not nested)
      const divContent = divMatch[0];
      const beforeDiv = bodyContent.substring(0, divMatch.index);
      
      // Simple check: if there are no unclosed div tags before this one, it's a direct child
      const openDivsBefore = (beforeDiv.match(/<div[^>]*>/gi) || []).length;
      const closeDivsBefore = (beforeDiv.match(/<\/div>/gi) || []).length;
      
      if (openDivsBefore === closeDivsBefore) {
        sections.push(divContent);
      }
    }
  } else {
    // If no body tag found, extract the inner content from the outer div
    // This handles cases where the fragment content doesn't have a body wrapper
    const outerDivRegex = /<div[^>]*>([\s\S]*?)<\/div>\s*$/i;
    const outerMatch = html.match(outerDivRegex);
    
    if (outerMatch) {
      logger.log(`Outer match: ${outerMatch[1]}`);
      // Extract the inner content (remove the outer div wrapper)
      sections.push(outerMatch[1]);
    } else {
      // Fallback: use the entire HTML
      sections.push(html);
    }
  }
  
  return sections;
}

// Create fragment structure like client-side createTag and append
function createFragmentStructure(sections, fragmentPath) {
  // Use normalizePath to get the correct data-path format
  const normalizedPath = normalizePath(fragmentPath, true);
  
  // Create fragment wrapper like client-side createTag
  let fragmentHTML = ``;
  
  // Append sections like client-side fragment.append(...sections)
  // This ensures the original content is WRAPPED, not replaced
  sections.forEach(section => {
    fragmentHTML += section;
  });
  
  return fragmentHTML;
}

// Replace relative media paths with absolute URLs (like client-side replaceDotMedia)
function replaceDotMedia(fragmentHTML, fragmentPath) {
  // Extract base URL from fragment path
  let baseUrl = '';
  try {
    const url = new URL(fragmentPath);
    baseUrl = url.origin + url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1);
  } catch {
    // If path is not a valid URL, use as is
    baseUrl = fragmentPath.substring(0, fragmentPath.lastIndexOf('/') + 1);
  }
  
  // Replace relative media paths with absolute URLs
  let processedHTML = fragmentHTML;
  
  // Replace src attributes with relative media paths
  processedHTML = processedHTML.replace(
    /src="\.\/media_([^"]+)"/g,
    (match, mediaPath) => `src="${baseUrl}media_${mediaPath}"`
  );
  
  // Replace srcset attributes with relative media paths
  processedHTML = processedHTML.replace(
    /srcset="\.\/media_([^"]+)"/g,
    (match, mediaPath) => `srcset="${baseUrl}media_${mediaPath}"`
  );
  
  // Replace domain from main--cc--adobecom.aem.page to www.stage.adobe.com
  processedHTML = processedHTML.replace(
    /https:\/\/main--cc--adobecom\.aem\.page/g,
    'https://www.stage.adobe.com'
  );
  
  return processedHTML;
}

// Create fragment wrapper similar to client-side createTag approach
function createFragmentWrapper(fragmentHTML, path, manifestId, targetManifestId) {
  // Since processFragmentContent already creates the fragment structure,
  // we just need to add the manifest IDs to the existing fragment div
  
  // Add manifest ID if available
  if (manifestId) {
    fragmentHTML = fragmentHTML.replace(
      /<div class="fragment" data-path="[^"]*"/,
      `$& data-manifest-id="${manifestId}"`
    );
  }
  
  // Add target manifest ID if available
  if (targetManifestId) {
    fragmentHTML = fragmentHTML.replace(
      /<div class="fragment" data-path="[^"]*"[^>]*/,
      `$& data-adobe-target-testid="${targetManifestId}"`
    );
  }
  
  return fragmentHTML;
}

// Create content element (like client-side createContent)
function createContentElement(content, cmd, placeholders = {}) {
  const isFragment = content.startsWith('/') || content.startsWith('http');
  
  let elementHTML = '';
  if (isFragment) {
    // Create link element (like client-side createFrag)
    let href = content;
    try {
      const url = new URL(content);
      href = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      // ignore
    }
    
    // Create anchor element (like client-side createFrag)
    const a = `<a href="${href}">${content}</a>`;
    
    // Check if it's a delayed modal anchor (like client-side createFrag)
    const isDelayedModalAnchor = /#.*delay=/.test(href);
    
    if (isDelayedModalAnchor) {
      // Wrap in p with hide-block class (like client-side createFrag)
      elementHTML = `<p class="hide-block">${a}</p>`;
    } else {
      // Wrap in p without hide-block class (like client-side createFrag)
      elementHTML = `<p>${a}</p>`;
    }
  } else {
    // Create div with content
    elementHTML = `<div>${content}</div>`;
  }
  
  // Add IDs directly to the HTML string
  if (cmd.manifestId || cmd.targetManifestId) {
    const idAttributes = [];
    if (cmd.manifestId) idAttributes.push(`data-manifest-id="${cmd.manifestId}"`);
    if (cmd.targetManifestId) idAttributes.push(`data-adobe-target-testid="${cmd.targetManifestId}"`);
    
    // Insert attributes after the opening tag
    const tagEnd = elementHTML.indexOf('>');
    if (tagEnd > 0) {
      elementHTML = elementHTML.slice(0, tagEnd) + ' ' + idAttributes.join(' ') + elementHTML.slice(tagEnd);
    }
  }
  
  return elementHTML;
}

function createFragmentHTML(content, el) {
  // Match personalization.js createFrag behavior exactly
  const noParagraphWrap = el?.getAttribute('class')?.includes('p') || false;
  
  if (noParagraphWrap) {
    return `<a href="${content}">${content}</a>`;
  } else {
    return `<p><a href="${content}">${content}</a></p>`;
  }
}

async function createFragmentContent(content, el, placeholders = {}) {
  // Match personalization.js createContent behavior exactly
  
  logger.log(`🔍 createFragmentContent called with content: "${content}"`);
  
  // Check if content is a fragment (starts with / or http) - this is the key logic from personalization.js
  const isFragment = content.startsWith('/') || content.startsWith('http');
  
  logger.log(`🔍 Content isFragment: ${isFragment}`);
  
  if (isFragment) {
    // For fragments: fetch the actual content (server-side enhancement)
    logger.log(`🔍 Fetching fragment content from: "${content}"`);
    const fragmentContent = await fetchFragmentContent(content);
    logger.log(`🔍 Fragment content fetched: ${fragmentContent ? 'SUCCESS' : 'FAILED'}`);
    
    if (fragmentContent) {
      logger.log(`🔍 Fragment content length: ${fragmentContent.length}`);
      logger.log(`🔍 Fragment content preview: ${fragmentContent.substring(0, 200)}...`);
      
      // Apply placeholder replacement to the fragment content
      const processedContent = replacePlaceholders(fragmentContent, placeholders);
      logger.log(`🔍 Processed content length: ${processedContent.length}`);
      
      if (processedContent !== fragmentContent) {
        logger.log(`🔍 Placeholders were replaced in fragment content`);
      } else {
        logger.log(`🔍 No placeholders were replaced in fragment content`);
      }
      
      return processedContent;
    } else {
      // Fallback: create <a> tag with href (like personalization.js createFrag)
      logger.log(`🔍 Using fallback <a> tag for fragment content`);
      const noParagraphWrap = el?.getAttribute('class')?.includes('p') || false;
      
      if (noParagraphWrap) {
        return `<a href="${content}">${content}</a>`;
      } else {
        return `<p><a href="${content}">${content}</a></p>`;
      }
    }
  } else {
    // For non-fragments: create div with content (like personalization.js)
    logger.log(`🔍 Creating div for non-fragment content`);
    return `<div>${content}</div>`;
  }
}
