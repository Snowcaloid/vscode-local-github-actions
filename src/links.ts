import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink, Range, Uri } from "vscode";
import { LocalFileUsesParser } from "./parser";
import { Validator } from "./validator";


export class LocalFileDocumentLinkProvider implements DocumentLinkProvider {
    provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {
        const links: DocumentLink[] = [];
        const usesReferences = LocalFileUsesParser.parse(document);
        if (!Validator.validate(document, usesReferences)) return links; // reuturns only when context is not yet properly set up
        for (const ref of usesReferences) {
            if (ref.file) {
                const link = new DocumentLink(ref.range, ref.file);
                links.push(link);
            }
        }
        return links;
    }
}