import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";
import { authenticate } from "./Auth/Auth";
import { getPersonalizationData } from "./Personalize/Personalize";
import { rewriteWithBufferedHtml } from "./Personalize/Rewriter";
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
    // logger.log("Making Subrequest");
    const response = await httpRequest(requestUrl, {
      headers: subrequestHeaders
    });
    // logger.log("Subrequest Received");

    // Set cache control headers to prevent caching of personalized pages
    const responseHeaders = response.getHeaders();
    responseHeaders["Cache-Control"] = ["max-age=0, no-store, no-cache"];
    responseHeaders["Expires"] = ["0"];
    responseHeaders["Pragma"] = ["no-cache"];
    responseHeaders["Set-Cookie"] = [cookie];
    
    // Remove content-encoding header to prevent decoding issues when we modify content
    delete responseHeaders["content-encoding"];
    delete responseHeaders["Content-Encoding"];

    // Fetch HTML Response Once, buffer the response
    // logger.log("Buffering HTML response");
    const bufferedHtml = await response.text();
    // logger.log(`HTML buffered successfully (${bufferedHtml.length} characters)`);

    // Check if we should personalize this request
    if (shouldPersonalize(request)) {
      // logger.log("Personalizing page");
      return await personalize(request, bufferedHtml, responseHeaders, response.status);
    }

    // Return original response without personalization
    logger.log("Not personalizing page");
    
    // Update Content-Length header to match actual body length
    responseHeaders["content-length"] = [bufferedHtml.length.toString()];
    
    return createResponse(
      response.status,
      responseHeaders,
      bufferedHtml
    );
  } catch (e) {
    logger.log("Caught Error");
    if (e instanceof Error) {
      return createResponse(500, {}, e.message);
    }
    logger.log(`Error message: ${String(e)}`);
    return createResponse(500, {}, "");
  }
}

async function personalize(request, bufferedHtml, responseHeaders, status) {
  try {
    // logger.log("Starting personalization process with buffered HTML");
    
    // Authenticate user (for Target API if needed)
    const authState = await authenticate(request);
    // logger.log(`Authentication completed: ${authState.type}`);
    
    // Extract manifests from <meta> tags using buffered HTML
    // logger.log("Extracting manifests from buffered HTML");
    const personalizationData = await getPersonalizationData(request, authState, bufferedHtml);
    
    // logger.log(`Personalization Data Summary:`, JSON.stringify({
    //   fragmentsCount: personalizationData.fragments?.length || 0,
    //   commandsCount: personalizationData.commands?.length || 0,
    //   fragments: personalizationData.fragments?.map(f => ({ selector: f.selector, val: f.val })) || [],
    //   commands: personalizationData.commands?.map(c => ({ action: c.action, selector: c.selector })) || []
    // }));
    
    // Check if we have any personalization data to apply
    if (!personalizationData.fragments?.length && !personalizationData.commands?.length) {
      logger.log("No personalization data to apply, returning original response");
      
      // Update Content-Length header to match actual body length
      responseHeaders["content-length"] = [bufferedHtml.length.toString()];
      
      return createResponse(
        status,
        responseHeaders,
        bufferedHtml
      );
    }
    
    // Rewrite HTML Using Buffered Response
    // logger.log("Rewriting HTML using buffered response");
    const personalizedResponse = await rewriteWithBufferedHtml(bufferedHtml, personalizationData, responseHeaders, status);
    logger.log("=== PERSONALIZATION PROCESS COMPLETE ===");
    return personalizedResponse;
  } catch (e) {
    logger.log(`Personalization error: ${String(e)}`);
    logger.log(`Error stack: ${e instanceof Error ? e.stack : 'No stack trace'}`);
    
    // Return original buffered HTML if personalization fails
    logger.log("Returning original buffered HTML due to personalization failure");
    
    // Update Content-Length header to match actual body length
    responseHeaders["content-length"] = [bufferedHtml.length.toString()];
    
    return createResponse(
      status,
      responseHeaders,
      bufferedHtml
    );
  }
}

export {
  responseProvider
};