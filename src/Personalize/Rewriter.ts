import { HtmlRewritingStream } from "html-rewriter";
import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";
import { TextEncoder } from "encoding";
import { ReadableStream } from "streams";
import { normalizePath, replacePlaceholders } from "./ManifestUtils";

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
export const rewriteWithBufferedHtml = async (bufferedHtml: string, data: any, responseHeaders: any, status: number) => {
  // logger.log("=== HTML REWRITING START (Buffered Mode) ===");
  // logger.log("Processing data:", JSON.stringify({
  //  fragmentsCount: data?.fragments?.length || 0,
  //  commandsCount: data?.commands?.length || 0
  // }));

  // Transform commands for processing (like client-side handleCommands)
  const transformedData = await Promise.all(
    data?.commands?.map(async (cmd: any) => {
      if (cmd.type === "fragment") {
        return { ...cmd, type: "fragment", path: cmd.path };
      }
      
      let { modifiedSelector, modifiers, attribute } = modifyNonFragmentSelector(cmd.selector, cmd.action);
      return { ...cmd, selector: modifiedSelector, attribute };
    }) || []
  );

  // logger.log("Transformed commands:", transformedData.length);

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
    // logger.log(`🔍 Processing command: action="${action}", selector="${selector}", content="${content}", type="${type}", hasFragmentContent="${hasFragmentContent}"`);

    // Handle fragment commands (like client-side getSelectedElements for fragments)
    if (type === "fragment") {
      logger.log(`🔍 Processing as FRAGMENT: selector="${selector}", action="${action}"`);
      // const fragmentHTML = await fetchFragmentContent(path);
      // logger.log(`Fragment HTML: ${fragmentHTML}`);
      // if (!fragmentHTML) {
      //   continue;
      // }

      // Final safety check before calling rewriter.onElement
      // if (selector.trim() === '') {
      //   logger.log(`Final check: Skipping fragment command with empty selector after processing`);
      //   continue;
      // }

      // Capture fragmentHTML in closure to ensure it's available in callback
      // const capturedFragmentHTML = fragmentHTML;
      // rewriter.onElement(selector, (el) => {
      //   // Apply placeholder replacement to the fragment content
      //   const processedFragmentHTML = replacePlaceholders(capturedFragmentHTML, data?.placeholders || {});
      //   el.replaceChildren(processedFragmentHTML);
      // });
      // rewriter.onElement(selector, (el) => {
      //   // Apply placeholder replacement to fragment content (like client-side)
      //   const processedFragmentHTML = replacePlaceholders(fragmentHTML, data?.placeholders || {});
      //   el.replaceChildren(processedFragmentHTML);
      // });
      continue;
    }

    // Handle commands with fragment content (like client-side createContent for fragment content)
    // if (hasFragmentContent) {
    //   // logger.log(`🔍 Processing command with fragment content: selector="${selector}", content="${content}"`);
      
    //   // Final safety check before calling rewriter.onElement
    //   if (selector.trim() === '') {
    //     logger.log(`Final check: Skipping command with empty selector after processing`);
    //     continue;
    //   }

    //   rewriter.onElement(selector, async (el) => {
    //     if (action === "replace") {
    //       const classAttr = el.getAttribute("class") || "";
    //       if (!classAttr.split(/\s+/).includes("p13n-replaced")) {
    //         // Apply placeholder replacement to content (like personalization.js)
    //         const processedContent = replacePlaceholders(content, data?.placeholders || {});
    //         logger.log(`Original content: "${content}"`);
    //         logger.log(`Processed content: "${processedContent}"`);
            
    //         // Create content (like client-side createContent)
    //         const newContent = await createFragmentContent(processedContent, el, data?.placeholders || {});
            
    //         // Use before() which IS supported in Akamai EdgeWorkers
    //         el.before(newContent);
    //         el.setAttribute("class", classAttr + " p13n-replaced");
    //       }
    //     }
    //   });
      
    //   continue;
    // }

    // Handle regular commands (like client-side handleCommands for non-fragment content)
    // Final safety check before calling rewriter.onElement
    // if (selector.trim() === '') {
    //   logger.log(`Final check: Skipping command with empty selector after processing`);
    //   continue;
    // }
    // logger.log(`Selector: ${selector}`);

    // rewriter.onElement(selector, async (el) => {
    //   if (action === "remove") {
    //     // Mark with p13n-deleted class (like personalization.js)
    //     const classAttr = el.getAttribute("class") || "";
    //     el.setAttribute("class", classAttr + " p13n-deleted");
        
    //     // Actually remove the element (Akamai-compatible)
    //     el.replaceWith('');
    //   } else if (action === "replace") {
    //     // Match personalization.js: insert before instead of replace children
    //     const classAttr = el.getAttribute("class") || "";
    //     if (!classAttr.split(/\s+/).includes("p13n-replaced")) {
    //       // Apply placeholder replacement to content (like personalization.js)
    //       // const processedContent = replacePlaceholders(content, data?.placeholders || {});
    //       logger.log(`Original content: "${content}"`);
    //       logger.log(`Processed content: "${processedContent}"`);
          
    //       // Create content (like client-side createContent for non-fragment content)
    //       const newContent = await createFragmentContent(processedContent, el, data?.placeholders || {});
          
    //       // Use before() which IS supported in Akamai EdgeWorkers
    //       el.before(newContent);
    //       el.setAttribute("class", classAttr + " p13n-replaced");
    //     }
    //   } else if (action === "updateAttribute" && attribute) {
    //     // Apply placeholder replacement to attribute value
    //     const processedContent = replacePlaceholders(content, {});
    //     el.setAttribute(attribute, processedContent);
    //   }
    // });
    rewriter.onElement(selector, (el) => {
      if (action === "remove") {
        const classAttr = el.getAttribute("class") || "";
        el.setAttribute("class", classAttr + " p13n-deleted");
        el.replaceWith('');
      } else if (action === "replace") {
        const classAttr = el.getAttribute("class") || "";
        if (!classAttr.split(/\s+/).includes("p13n-replaced")) {
          logger.log(`Original content: "${content}"`);
          // Apply placeholder replacement to content (like client-side)
          const processedContent = replacePlaceholders(content, data?.placeholders || {});
          logger.log(`Processed content: "${processedContent}"`);
          el.replaceChildren(processedContent);
          el.setAttribute("class", classAttr + " p13n-replaced");
        }
      } else if (action === "updateAttribute" && attribute) {
        // Apply placeholder replacement to attribute value
        const processedContent = replacePlaceholders(content, data?.placeholders || {});
        el.setAttribute(attribute, processedContent);
        
        // Add IDs if available
        if (cmd.manifestId || cmd.targetManifestId) {
          addIds(el, cmd.manifestId || '', cmd.targetManifestId || '');
        }
      } else if (action in CREATE_CMDS) {
        // Handle CREATE_CMDS actions (like client-side)
        const insertPosition = CREATE_CMDS[action as keyof typeof CREATE_CMDS];
        const processedContent = replacePlaceholders(content, data?.placeholders || {});
        
        // Create content element
        const newContentHTML = createContentElement(processedContent, cmd, data?.placeholders || {});
        
        // Use appropriate method based on insert position
        if (insertPosition === 'beforebegin') {
          el.before(newContentHTML);
        } else if (insertPosition === 'afterend') {
          el.after(newContentHTML);
        } else if (insertPosition === 'afterbegin') {
          el.prepend(newContentHTML);
        } else if (insertPosition === 'beforeend') {
          el.append(newContentHTML);
        }
        
        // Note: IDs will be added to the HTML string itself since we can't manipulate DOM after insertion
      }
    });
  
  }

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
  // logger.log(`Modifying selector: "${selector}" for action: "${action}"`);
  
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

  // logger.log(`Modified selector result: "${modifiedSelector}"`);

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

function fetchFragmentContent(path: string): Promise<string | null> {
  try {
    // Process path like personalization.js
    let plainPath = path.endsWith('/') ? `${path}index` : path;
    plainPath = plainPath.endsWith('.plain.html') ? plainPath : `${plainPath}.plain.html`;
    
    // Remove hash fragments before adding .plain.html
    if (plainPath.includes('#')) {
      const [pathWithoutHash] = plainPath.split('#');
      plainPath = pathWithoutHash;
      plainPath = plainPath.endsWith('.plain.html') ? plainPath : `${plainPath}.plain.html`;
    }
    
    // Use normalizePath to handle localization and domain mapping
    const normalizedPath = normalizePath(plainPath, true);
    
    // logger.log(`Fetching fragment content from: ${normalizedPath}`);
    
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

    const contentType = response.getHeader('content-type');
    // if (!contentType || !contentType.includes('text/html')) {
    //   logger.log(`Invalid content type for fragment ${normalizedPath}: ${contentType}`);
    //   return null;
    // }

    const fragmentContent = await response.text();
    if (!fragmentContent) {
      logger.log(`Empty fragment content for ${normalizedPath}`);
      return null;
    }

    // logger.log(`Successfully fetched fragment content from ${normalizedPath}, length: ${fragmentContent.length}`);
    return fragmentContent;
  } catch (error) {
    logger.log(`Error fetching fragment ${path}: ${error}`);
    return null;
  }
}

// Add element IDs (like client-side addIds)
function addIds(el: any, manifestId: string, targetManifestId: string) {
  if (manifestId) el.setAttribute('data-manifest-id', manifestId);
  if (targetManifestId) el.setAttribute('data-adobe-target-testid', targetManifestId);
}

// Create content element (like client-side createContent)
function createContentElement(content: string, cmd: any, placeholders: any = {}): string {
  const isFragment = content.startsWith('/') || content.startsWith('http');
  
  let elementHTML = '';
  if (isFragment) {
    // Create link element (like client-side createFrag)
    elementHTML = `<a href="${content}">${content}</a>`;
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

function createFragmentHTML(content: string, el: any): string {
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
