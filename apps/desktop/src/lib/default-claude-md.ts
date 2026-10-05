/** Written once into new projects. Agents load it on every request, so keep it
 *  short and limited to facts that are true for this project. */
export const DEFAULT_CLAUDE_MD = `# LaTeX project

This is a LaTeX writing project edited in AresPrism.

- AresPrism compiles the document and refreshes the PDF preview itself; build output goes to \`.prism/build/\`.
- Do not edit \`.prism/\` or \`.claudeprism/\` (build cache and version snapshots).
- The compiler and engine are chosen in AresPrism. A \`% !TEX program = xelatex\` (or \`pdflatex\`, \`lualatex\`) line at the top of the main file overrides the engine.
`;
