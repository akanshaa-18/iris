import { HtmlRewritingStream } from "html-rewriter";
import { Instructions } from "./ParseInstructions";

export const createRewriter = (
  instructions: Instructions
): HtmlRewritingStream => {
  const rewriter = new HtmlRewritingStream();
  rewriter.onElement("head", (el) => {
    el.append('<meta name="edge-personalized" content="true">');
  });
  return rewriter;
};
