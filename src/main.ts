import { createResponse } from "create-response";
import { httpRequest } from "http-request";
import { logger } from "log";
import { authenticate } from "./Auth/Auth";
import { getPersonalizationDataWithManifests } from "./Personalize/Personalize";
import { rewrite } from "./Personalize/Rewriter";
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
  try {
    const authState = await authenticate(request);
    
    // Use Phase 5 enhanced personalization function
    const personalizationData = await getPersonalizationDataWithManifests(request, authState);
    
    if (!personalizationData.fragments?.length && !personalizationData.commands?.length) {
      logger.log("No personalization data to apply, returning original response");
      const responseBody = await response.text();
      responseHeaders["content-length"] = [responseBody.length.toString()];
      return createResponse(
        response.status,
        responseHeaders,
        responseBody
      );
    }
    
    logger.log("Phase 5: Rewriting HTML with enhanced personalization data");
    logger.log("Personalization data:", {
      fragments: personalizationData.fragments?.length || 0,
      commands: personalizationData.commands?.length || 0
    });
    
    const personalizedResponse = await rewrite(response, personalizationData, responseHeaders);
    return personalizedResponse;
  } catch (e) {
    logger.log("Phase 5: Error in personalization:", e);
    const responseBody = await response.text();
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