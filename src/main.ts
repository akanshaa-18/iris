import { createResponse } from "create-response";
import { HtmlRewritingStream } from "html-rewriter";
import { httpRequest } from "http-request";

export async function responseProvider(request: EW.ResponseProviderRequest) {
    try {
    const response = await httpRequest(`${request.scheme}://${request.host}${request.path}.html`);

    const rewriter = new HtmlRewritingStream();
    rewriter.onElement('head', el => {
      el.append('<meta name="edge-personalized" content="true">');
    });
    return createResponse(
      response.status,
      response.getHeaders(),
      response.body.pipeThrough(rewriter)
    );
  } catch (_) {
    return createResponse(500, {}, "");
  }
};

export function onClientResponse(_: EW.EgressClientRequest, response: EW.EgressClientResponse) {
  response.addHeader('X-EW-Personalization-Page', 'true');
};
