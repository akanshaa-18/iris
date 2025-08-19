import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";
import { authenticate } from "./Auth/Auth";
import { getPersonalizationDataWithManifests } from "./Personalize/Personalize";
import { rewriteStreamWithContent } from "./Personalize/Rewriter";
import { shouldPersonalize, getVisitorStatus } from "./Utilities/Utilities";

const PROD_COOKIE_DOMAIN = '.adobe.com';

async function responseProvider(request) {
  try {
    const requestUrl = request.url;
    const cookie = getVisitorStatus({ request, domain: PROD_COOKIE_DOMAIN }).cookie;

    const subrequestHeaders = request.getHeaders();
    delete subrequestHeaders.host;
    subrequestHeaders["X-EW-Personalization-Page"] = ["true"];
    const response = await httpRequest(requestUrl, {
      headers: subrequestHeaders
    });

    const responseHeaders = response.getHeaders();
    responseHeaders["Cache-Control"] = ["max-age=0, no-store, no-cache"];
    responseHeaders["Expires"] = ["0"];
    responseHeaders["Pragma"] = ["no-cache"];
    responseHeaders["Set-Cookie"] = [cookie];
    
    delete responseHeaders["content-encoding"];
    delete responseHeaders["Content-Encoding"];

    if (shouldPersonalize(request)) {
      return await personalize(request, response, responseHeaders);
    }

    const responseBody = await response.text();
    responseHeaders["content-length"] = [responseBody.length.toString()];
    logger.log("=== RESPONSE DEBUG ===");
    logger.log("Response body length:", responseBody.length);
    logger.log("Content-Length header updated to:", responseBody.length);
    logger.log("Response headers being sent:", JSON.stringify(responseHeaders, null, 2));
    logger.log("Content-Length header:", responseHeaders["content-length"]);
    logger.log("Content-Type header:", responseHeaders["content-type"]);
    return createResponse(
      response.status,
      responseHeaders,
      responseBody
    );
  } catch (e) {
    if (e instanceof Error) {
      return createResponse(500, {}, e.message);
    }
    return createResponse(500, {}, "");
  }
}

async function personalize(request, response, responseHeaders) {
  let responseBody: string | null = null;
  
  try {
    // Step 1: Authenticate first (before any stream operations)
    const authState = await authenticate(request);
    logger.log("Step 1: Authentication complete");
    
    // Step 2: Read HTML content ONCE - this locks the stream
    responseBody = await response.text();
    logger.log("Step 2: Retrieved HTML content for processing, length:", responseBody.length);
    
    // Step 3: Extract metadata from HTML content
    const metadata = extractAllMetadataFromHTML(responseBody);
    logger.log("Step 3: Extracted metadata from HTML:", Object.keys(metadata));
    logger.log("Step 3: Key metadata values:", {
      manifestnames: metadata['manifestnames'],
      target: metadata['target'],
      personalization: metadata['personalization'],
      'personalization-v2': metadata['personalization-v2']
    });
    
    // Step 4: Process personalization with HTML metadata
    const personalizationData = await getPersonalizationDataWithManifests(request, authState, responseBody, metadata);
    
    logger.log("Step 4: Personalization data received:", {
      hasFragments: !!personalizationData.fragments,
      fragmentsCount: personalizationData.fragments?.length || 0,
      hasCommands: !!personalizationData.commands,
      commandsCount: personalizationData.commands?.length || 0
    });
    
    if (personalizationData.fragments?.length > 0) {
      logger.log("Step 4: Fragment details:", personalizationData.fragments.map(f => ({
        selector: f.selector,
        val: f.val,
        action: f.action
      })));
    }
    
    if (personalizationData.commands?.length > 0) {
      logger.log("Step 4: Command details:", personalizationData.commands.map(c => ({
        selector: c.selector,
        action: c.action,
        content: c.content?.substring(0, 100) + '...'
      })));
    }
    
    if (!personalizationData.fragments?.length && !personalizationData.commands?.length) {
      logger.log("No personalization data to apply, returning original response");
      // Remove content-encoding headers to prevent decoding issues
      delete responseHeaders["content-encoding"];
      delete responseHeaders["Content-Encoding"];
      delete responseHeaders["content-length"];
      delete responseHeaders["Content-Length"];
      
      return createResponse(
        response.status,
        responseHeaders,
        responseBody
      );
    }
    
    logger.log("Step 4: Personalization processing complete");
    logger.log("Personalization data:", {
      fragments: personalizationData.fragments?.length || 0,
      commands: personalizationData.commands?.length || 0
    });
    
    // Step 5: Rewrite HTML content with personalization data
    logger.log("Step 5: Starting HTML rewrite");
    const personalizedResponse = await rewriteStreamWithContent(responseBody, personalizationData, responseHeaders);
    return personalizedResponse;
  } catch (e) {
    logger.log("Error in personalization:", e);
    
    // Return the HTML content we already read, or a simple error response
    if (responseBody) {
      // We have the HTML content, return it as-is
      delete responseHeaders["content-encoding"];
      delete responseHeaders["Content-Encoding"];
      delete responseHeaders["content-length"];
      delete responseHeaders["Content-Length"];
      
      return createResponse(
        response.status,
        responseHeaders,
        responseBody
      );
    } else {
      // We never read the stream, so we can still access response.body
      delete responseHeaders["content-encoding"];
      delete responseHeaders["Content-Encoding"];
      delete responseHeaders["content-length"];
      delete responseHeaders["Content-Length"];
      
      return createResponse(
        response.status,
        responseHeaders,
        response.body
      );
    }
  }
}

// Function to extract all metadata from HTML content
function extractAllMetadataFromHTML(htmlContent: string): Record<string, string> {
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

export {
  responseProvider
};