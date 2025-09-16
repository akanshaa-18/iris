/* eslint-disable max-len */
import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";
import { authenticate } from "./Auth/Auth.js";
import { getPersonalizationData } from "./Personalize/Personalize.js";
import { rewriteWithBufferedHtml } from "./Personalize/Rewriter.js";
import { shouldPersonalize, getVisitorStatus } from "./Utilities/Utilities.js";

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
    const response = await httpRequest(requestUrl, {
      headers: subrequestHeaders
    });

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
    const bufferedHtml = await response.text();

    // Check if we should personalize this request
    if (shouldPersonalize(request)) {
      return await personalize(request, bufferedHtml, responseHeaders, response.status);
    }
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
    const authState = await authenticate(request);
    const personalizationData = await getPersonalizationData(
      request,
      authState,
      bufferedHtml
    );
    // Check if we have any personalization data to apply
    if (
      !(personalizationData.fragments?.length) &&
      !(personalizationData.commands?.length)
    ) {
      // Update Content-Length header to match actual body length
      responseHeaders["content-length"] = [
        bufferedHtml.length.toString()
      ];
      return createResponse(
        status,
        responseHeaders,
        bufferedHtml
      );
    }
    // Rewrite HTML Using Buffered Response
    const personalizedResponse = await rewriteWithBufferedHtml(
      bufferedHtml,
      personalizationData,
      responseHeaders,
      status
    );
    return personalizedResponse;
  } catch (e) {
    logger.log(
      `Error stack: ${e instanceof Error ? e.stack : 'No stack trace'}`
    );
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
