import { HtmlRewritingStream } from "html-rewriter";
import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";

const COMMANDS_KEYS = {
  remove: 'remove',
  replace: 'replace',
  updateAttribute: 'updateattribute',
};

export const rewrite = async (response, data, responseHeaders) => {
  logger.log("=== HTML REWRITING START ===");
  logger.log("Processing data:", {
   fragmentsCount: data?.fragments?.length || 0,
   commandsCount: data?.commands?.length || 0
  });

  const transformedData = await Promise.all(
    data?.commands?.map(async (cmd) => {
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
    //logger.log("Adding edge personalization meta tags to head");
    el.append('<meta name="edge-personalized" content="true" />');
    el.append('<script>window.edgePersonalizationApplied = true;</script>');
  });

  // Process fragments
  //logger.log("Processing fragments...");
  for (const cmd of data?.fragments || []) {
    const { selector, val: path } = cmd;
    //logger.log(`Loading fragment: ${path} for selector: ${selector}`);
    const fragmentHTML = await fetchFragmentContent(path);
    if (!fragmentHTML) {
      //logger.log(`Failed to load fragment: ${path}`);
      continue;
    }

    //logger.log(`Fragment loaded successfully: ${path} (${fragmentHTML.length} chars)`);
    rewriter.onElement(selector, (el) => {
      el.replaceChildren(fragmentHTML);
    });
  }

  // Process commands
  //logger.log("Processing commands...");
  for (const cmd of transformedData) {
    const { action, selector, content, attribute, type, path } = cmd;

    if (type === "fragment") {
      //logger.log(`Loading fragment command: ${path} for selector: ${selector}`);
      const fragmentHTML = await fetchFragmentContent(path);
      if (!fragmentHTML) {
        //logger.log(`Failed to load fragment command: ${path}`);
        continue;
      }

      //logger.log(`Fragment command loaded: ${path} (${fragmentHTML.length} chars)`);
      rewriter.onElement(selector, (el) => {
        el.replaceChildren(fragmentHTML);
      });

      continue;
    }

    //logger.log(`Applying command: ${action} on selector: ${selector}`);
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

  //logger.log("=== HTML REWRITING COMPLETE ===");
  
  // Remove Content-Length header since we're modifying the content
  delete responseHeaders["content-length"];
  delete responseHeaders["Content-Length"];
  
  return createResponse(
    response.status,
    responseHeaders,
    response.body.pipeThrough(rewriter)
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
    // For now, return a placeholder. In a real implementation, this would fetch the fragment
    // from a CDN or content management system
    return `<div class="fragment-placeholder">Fragment content for: ${path}</div>`;
  } catch (e) {
    console.error(`Error fetching fragment ${path}:`, e);
    return null;
  }
}
