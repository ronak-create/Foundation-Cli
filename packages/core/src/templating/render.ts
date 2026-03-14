import ejs from "ejs";
import { FoundationError } from "../errors.js";

export class TemplateRenderError extends FoundationError {
  constructor(message: string) {
    super(`Template render failed: ${message}`, "ERR_TEMPLATE_RENDER");
    this.name = "TemplateRenderError";
  }
}

export type TemplateVariables = Record<string, unknown>;

/**
 * Renders an EJS template string with the given variables.
 *
 * @param templateString  Raw EJS template content.
 * @param variables       Key-value pairs available in the template.
 * @returns               Rendered string.
 * @throws TemplateRenderError on any EJS render failure.
 */
export function renderTemplate(
  templateString: string,
  variables: TemplateVariables,
): string {
  try {
    return ejs.render(templateString, variables, {
      // Disable file includes for security — templates are in-memory only.
      root: undefined,
      views: [],
      // Strict mode: accessing undefined variables throws.
      strict: false,
      // rmWhitespace: false keeps intentional whitespace in generated files.
      rmWhitespace: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TemplateRenderError(message);
  }
}

/**
 * Renders all EJS templates in a flat record of path→content pairs.
 * Non-template files (no EJS tags) pass through unchanged.
 *
 * @param files      Map of relativePath → raw template content.
 * @param variables  Variables made available to all templates.
 * @returns          Map of relativePath → rendered content.
 */
export function renderAllTemplates(
  files: ReadonlyArray<{ relativePath: string; content: string }>,
  variables: TemplateVariables,
): Array<{ relativePath: string; content: string }> {
  return files.map((file) => ({
    relativePath: file.relativePath,
    content: renderTemplate(file.content, variables),
  }));
}
