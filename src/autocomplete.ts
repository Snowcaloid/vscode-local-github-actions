import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, Position, ProviderResult, Range, TextDocument, workspace } from "vscode";
import { ACTION, ENV, JOBS, RUNS, STEPS, WITH, WORKFLOW } from "./parser";
import { basename, extname } from "path";


export class AutoCompleteProvider implements CompletionItemProvider {
    private lastFile: string = '';
    private lastLine: number = -1;
    private files: string[] = [];
    public async provideCompletionItems(
        document: TextDocument,
        position: Position,
        token: CancellationToken,
        context: CompletionContext
    ): Promise<CompletionItem[]> {
        const line = document.lineAt(position);
        const text = line.text.trim();
        const key = text.split(':')[0].trim();
        if (key !== 'uses') {
            return [];
        }
        const current = line.text.substring(0, position.character).split(':')[1]?.trimStart() ?? '';
        if (current.length > 2 && !current.match(/^\.\/.*/)) {
            return [];
        }

        const suggestions: CompletionItem[] = [];
        const contextType = await this.findContext(document, position);
        if (this.lastLine !== position.line || this.lastFile !== document.uri.path)
            switch (contextType) {
                case WORKFLOW:
                    this.files = (await workspace.findFiles('.github/workflows/**/*.{yml,yaml}')).map(f => `./${workspace.asRelativePath(f)}`);
                    break;
                case ACTION:
                    this.files = (await workspace.findFiles('.github/actions/**/*.{yml,yaml}')).map(f => `./${workspace.asRelativePath(f).replace(/\/action\.ya?ml/i, "")}`);
                    break;
                default:
                    this.files = [];
                    return [];
            }

        const range = new Range(
            new Position(line.lineNumber, line.text.indexOf(current)),
            new Position(line.lineNumber, line.range.end.character)
        )

        for (const file of this.files) {
            if (file.startsWith(current)) {
                const item = new CompletionItem(file, CompletionItemKind.File);
                switch (contextType) {
                    case WORKFLOW:
                        item.detail = `Local workflow \`${basename(file, extname(file))}\``;
                        break;
                    case ACTION:
                        item.detail = `Local action \`${basename(file)}\``;
                        break;
                }
                item.range = range;
                suggestions.push(item);
            }
        }
        this.lastLine = position.line;
        return suggestions;
    }

    public findContext(document: TextDocument, position: Position): 'workflow' | 'action' | undefined {
        let currentLineIndent = document.lineAt(position).firstNonWhitespaceCharacterIndex;

        // Track context as we go backwards
        let foundJobs = false;
        let foundRuns = false;
        let insideJob = false;
        let insideSteps = false;
        let jobName: string | null = null;

        // Go backwards line by line
        for (let lineNum = position.line - 1; lineNum >= 0; lineNum--) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            const lineIndent = line.firstNonWhitespaceCharacterIndex;
            const trimmedLine = lineText.trim();

            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // If we encounter a line with less indentation, we're moving up in hierarchy
            if (lineIndent < currentLineIndent) {
                const [key, value] = this.parseKeyValue(trimmedLine);

                // Check for exclusion contexts first
                if (key === WITH || key === ENV) {
                    return; // Invalid context
                }

                // Check for steps array
                if (key === STEPS && this.isArrayStart(value)) {
                    insideSteps = true;
                    currentLineIndent = lineIndent; // Update reference indentation
                    continue;
                }

                // Check for job definitions (under jobs)
                if (foundJobs && key && !key.includes(' ') && value === undefined) {
                    jobName = key;
                    insideJob = true;
                    currentLineIndent = lineIndent;
                    continue;
                }

                // Check for top-level keys
                if (lineIndent === 0) {
                    if (key === JOBS) {
                        foundJobs = true;
                        if (insideSteps) {
                            return ACTION;
                        }
                        if (insideJob && !insideSteps) {
                            return WORKFLOW;
                        }
                    } else if (key === RUNS) {
                        foundRuns = true;
                        if (insideSteps) return ACTION;
                    }
                }

                // Update reference indentation for next iteration
                currentLineIndent = lineIndent;
            }
        }

        return undefined; // No valid context found
    }

    private parseKeyValue(line: string): [string | null, string | undefined] {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            return [null, undefined];
        }

        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        return [key, value || undefined];
    }

    private isArrayStart(value: string | undefined): boolean {
        return value === undefined || value === '' || value === '[]';
    }
}
