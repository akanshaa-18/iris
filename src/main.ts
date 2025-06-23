// src/main.ts
import { createResponse } from "create-response";
import { httpRequest } from "http-request"; 
import { getCookie, safeHeaders, setCookie } from "./Utilities/Utilities";
import { logger } from "log";
import { authenticate } from "./Auth/Auth";
import { getPersonalizationData } from "./Personalize/Personalize";
import { parseInstructionsFrom } from "./Personalize/ParseInstructions";
import { createRewriter } from "./Personalize/Rewriter";

async function responseProvider(request: EW.ResponseProviderRequest) {
  try {
    const subrequestHeaders = request.getHeaders();
    subrequestHeaders["X-EW-Personalization-Page"] = ["true"];
    logger.log("Making Subrequest");
    const response = await httpRequest(request.url, {
      headers: subrequestHeaders,
    });
    logger.log("Subrequest Recieved");

    if (shouldNotPersonalize(request)) {
      logger.log("Do not personalize this page");
      return createResponse(
        response.status,
        safeHeaders(response.getHeaders()),
        response.body
      );
    }

    logger.log("Authenticating (Not Yet Implemented)");
    const authState = await authenticate(getCookie(request.getHeaders())('aux_sid'));

    logger.log("Make Call to AEP (Not Yet Implemented)");
    const personalizationData = getPersonalizationData(request, authState);

    logger.log("Parse instructions from Personalization Data (Not Yet Implemented)");
    const instructions = await parseInstructionsFrom(personalizationData);

    logger.log("Create Rewriter using Personalization Instructions");
    const rewriter = createRewriter(instructions);

    logger.log("Manipulating Set-Cookie Header");
    const responseHeaders = response.getHeaders()
    setCookie(responseHeaders, { name: "edge", value: "true" });

    logger.log("Rewriting HTML");
    return createResponse(
      response.status,
      safeHeaders(responseHeaders),
      response.body.pipeThrough(rewriter)
    );
  } catch (e) {
    logger.log("Caught Error");
    if (e instanceof Error) {
      return createResponse(500, {}, e.message);
    }
    return createResponse(500, {}, "");
  }
}

const shouldNotPersonalize = (
  request: EW.ResponseProviderRequest
): boolean => {
  return false;
};

export {
  responseProvider
};
