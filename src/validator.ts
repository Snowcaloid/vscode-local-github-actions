import { Diagnostic, DiagnosticCollection, DiagnosticSeverity, TextDocument, Uri, workspace } from "vscode";
import { ACTION, UsesReference, WORKFLOW } from "./parser";
import path from "path";
import { statSync } from "fs";

function leaf(path: string): string {
    const parts = path.split('/');
    if (parts.length === 0) return "";
    return parts[parts.length - 1];
}

function removeLeaf(path: string): string {
    const l = leaf(path);
    if (l === '') return path;
    return path.substring(0, path.length - l.length - 1);
}

export class Validator {
    public static collection: DiagnosticCollection | undefined;

    private static getBasePath(document: TextDocument): string | undefined {
        let path = document.uri.fsPath;
        while (leaf(path) !== '' && leaf(path) !== '.github') {
            path = removeLeaf(path);
        }
        return removeLeaf(path) ?? undefined;
    }

    public static async validate(document: TextDocument, refs: UsesReference[]): Promise<boolean> {
        if (!this.collection) return false;
        this.collection.delete(document.uri);

        const basePath = this.getBasePath(document);
        if (!basePath) return false; // Cant find files without path

        const diagnostics: Diagnostic[] = [];
        const check_files = workspace.getConfiguration('local-github-actions').get('file-exist-errors') ?? true;
        const check_file_placement = workspace.getConfiguration('local-github-actions').get('file-placement-errors') ?? true;
        if (!check_files && !check_file_placement) return true;

        for (const ref of refs) {
            // file = ref.content (resolved from current workspace root), then add action.yml or action.yaml if it's an action
            // if its a workflow, then its just the relative path to the file
            let fileName = path.join(basePath, ref.content);
            let exists = false;
            if (ref.type === ACTION) {
                fileName = path.join(fileName, 'action.yml');
                exists = statSync(fileName, { throwIfNoEntry: false }) !== undefined;
                if (!exists) {
                    fileName = path.join(path.dirname(fileName), 'action.yaml');
                }
            }
            if (check_file_placement && ref.type === ACTION && ref.content.match(/.*\.github\/workflows\/.*/)) {
                const diagnostic = new Diagnostic(
                    ref.range,
                    `The referenced local action "${ref.content}" is under ` +
                    "`.github/workflows`. Consider storing local actions under `.github/actions` or another folder outside of `.github/workflows.`",
                    DiagnosticSeverity.Error
                );
                diagnostics.push(diagnostic);
            }
            if (check_file_placement && ref.type === WORKFLOW && ref.content.match(/.*\.github\/actions\/.*/)) {
                const diagnostic = new Diagnostic(
                    ref.range,
                    `The referenced local workflow "${ref.content}" is under ` +
                    "`.github/actions`. Consider storing local workflows under `.github/workflows`.",
                    DiagnosticSeverity.Error
                );
                diagnostics.push(diagnostic);
            }
            if (!exists && statSync(fileName, { throwIfNoEntry: false }) === undefined) {
                if (check_files) {
                    const diagnostic = new Diagnostic(
                        ref.range,
                        `The referenced local ${ref.type} "${ref.content}" does not exist.`,
                        DiagnosticSeverity.Error
                    );
                    diagnostics.push(diagnostic);
                }
                continue;
            }
            ref.file = Uri.file(fileName);
        }
        if (diagnostics.length > 0) {
            this.collection.set(document.uri, diagnostics);
        }
        return true; // Validated (with or without errors)
    }
}