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

    const personalizationCheck = shouldPersonalize(request);
    if (personalizationCheck.shouldRun) {
      logger.log("=== PERSONALIZATION ENABLED ===");
      logger.log("=== PROMO PARAMETER:", personalizationCheck.promo, "===");
      return await personalize(request, response, responseHeaders, personalizationCheck.promo);
    }

    logger.log("=== NO PERSONALIZATION ===");
    const responseBody = await response.text();
    responseHeaders["content-length"] = [responseBody.length.toString()];
    
    return createResponse(
      response.status,
      responseHeaders,
      responseBody
    );
  } catch (e) {
    logger.log("=== ERROR IN RESPONSE PROVIDER ===", e);
    if (e instanceof Error) {
      return createResponse(500, {}, e.message);
    }
    return createResponse(500, {}, "Internal Server Error");
  }
}

async function personalize(request, response, responseHeaders, promoParam) {
  try {
    logger.log("=== PERSONALIZATION START ===");
    
    const authState = await authenticate(request);
    logger.log("Authentication completed:", authState.type);
    
    const personalizationData = await getPersonalizationDataWithManifests(request, authState, promoParam);
    
    logger.log("Personalization data received:", {
      fragments: personalizationData.fragments?.length || 0,
      commands: personalizationData.commands?.length || 0
    });
    
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
    
    logger.log("=== APPLYING PERSONALIZATION ===");
    const personalizedResponse = await rewrite(response, personalizationData, responseHeaders);
    logger.log("=== PERSONALIZATION COMPLETE ===");
    
    return personalizedResponse;
  } catch (e) {
    logger.log("=== ERROR IN PERSONALIZATION ===", e);
    
    try {
      const responseBody = await response.text();
      responseHeaders["content-length"] = [responseBody.length.toString()];
      return createResponse(
        response.status,
        responseHeaders,
        responseBody
      );
    } catch (innerError) {
      logger.log("=== ERROR FALLBACK FAILED ===", innerError);
      return createResponse(500, {}, "Personalization failed and fallback response could not be created.");
    }
  }
}

export {
  responseProvider
};