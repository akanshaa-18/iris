import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";
import { authenticate } from "./Auth/Auth";
import { getPersonalizationData } from "./Personalize/Personalize";
import { rewrite } from "./Personalize/Rewriter";
import { shouldPersonalize, getVisitorStatus } from "./Utilities/Utilities";

const PROD_COOKIE_DOMAIN = 'adobe.com';

async function responseProvider(request) {
  try {
    // Use the request URL directly instead of creating a new URL object
    const requestUrl = request.url;
    const cookie = getVisitorStatus({ request, domain: PROD_COOKIE_DOMAIN }).cookie;

    // Make subrequest to get the original response
    const subrequestHeaders = request.getHeaders();
    delete subrequestHeaders.host;
    subrequestHeaders["X-EW-Personalization-Page"] = ["true"];
    //logger.log("Making Subrequest");
    const response = await httpRequest(requestUrl, {
      headers: subrequestHeaders
    });
    //logger.log("Subrequest Received");

    // Set cache control headers to prevent caching of personalized pages
    const responseHeaders = response.getHeaders();
    responseHeaders["Cache-Control"] = ["max-age=0, no-store, no-cache"];
    responseHeaders["Expires"] = ["0"];
    responseHeaders["Pragma"] = ["no-cache"];
    responseHeaders["Set-Cookie"] = [cookie];
    
    // Remove content-encoding header to prevent decoding issues when we modify content
    delete responseHeaders["content-encoding"];
    delete responseHeaders["Content-Encoding"];

    // Check if we should personalize this request
    if (shouldPersonalize(request)) {
      //logger.log("Personalizing page");
      return await personalize(request, response, responseHeaders);
    }

    // Return original response without personalization
    //logger.log("Not personalizing page");
    // logger.log("Returning original response without personalization");
    // logger.log("Response status:", response.status);
    // logger.log("Response headers:", JSON.stringify(responseHeaders, null, 2));
    
    // Get response body properly for Akamai EdgeWorkers
    const responseBody = await response.text();
    
    // Update Content-Length header to match actual body length
    responseHeaders["content-length"] = [responseBody.length.toString()];
    
    // Debug: Check for problematic headers
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
    //logger.log("Caught Error");
    if (e instanceof Error) {
      return createResponse(500, {}, e.message);
    }
    //logger.log(`Error message: ${String(e)}`);
    return createResponse(500, {}, "");
  }
}

async function personalize(request, response, responseHeaders) {
  try {
    //logger.log("Starting personalization process");
    
    // Authenticate user
    const authState = await authenticate(request);
    //logger.log(`Authentication completed: ${authState.type}`);
    
    // Get personalization data from Adobe Target
    //logger.log("Fetching personalization data from Adobe Target...");
    const personalizationData = await getPersonalizationData(request, authState);
    // logger.log("Personalization Data Summary:", {
    //  fragmentsCount: personalizationData.fragments?.length || 0,
    //  commandsCount: personalizationData.commands?.length || 0,
    //  fragments: personalizationData.fragments?.map(f => ({ selector: f.selector, val: f.val })) || [],
    //  commands: personalizationData.commands?.map(c => ({ action: c.action, selector: c.selector })) || []
    // });
    // logger.log(`Personalization data retrieved: ${personalizationData.fragments?.length || 0} fragments, ${personalizationData.commands?.length || 0} commands`);
    
    // Check if we have any personalization data to apply
    if (!personalizationData.fragments?.length && !personalizationData.commands?.length) {
      logger.log("No personalization data to apply, returning original response");
      logger.log("Response status:", response.status);
      
      // Get response body properly for Akamai EdgeWorkers
      const responseBody = await response.text();
      // logger.log("Response body length:", responseBody?.length || "unknown");
      // logger.log("Response body preview:", responseBody?.substring(0, 200) || "no body");
      // logger.log("Response headers:", JSON.stringify(responseHeaders, null, 2));
      
      // Update Content-Length header to match actual body length
      responseHeaders["content-length"] = [responseBody.length.toString()];
      
      return createResponse(
        response.status,
        responseHeaders,
        responseBody
      );
    }
    
    // Rewrite HTML with personalization
    logger.log("Rewriting HTML with personalization data");
    const personalizedResponse = await rewrite(response, personalizationData, responseHeaders);
    //logger.log("=== PERSONALIZATION PROCESS COMPLETE ===");
    return personalizedResponse;
  } catch (e) {
    //logger.log(`Personalization error: ${String(e)}`);
    //logger.log(`Error stack: ${e instanceof Error ? e.stack : 'No stack trace'}`);
    
    // Return original response if personalization fails
    const responseBody = await response.text();
    
    // Update Content-Length header to match actual body length
    responseHeaders["content-length"] = [responseBody.length.toString()];
    
    return createResponse(
      response.status,
      responseHeaders,
      responseBody
    );
  }
}

export {
  responseProvider
};