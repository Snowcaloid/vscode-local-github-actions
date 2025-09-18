import { ExtensionContext, languages } from 'vscode';
import { Validator } from './validator';
import { LocalFileDocumentLinkProvider } from './links';
import { AutoCompleteProvider } from './autocomplete';

export function activate(context: ExtensionContext) {
    Validator.collection = languages.createDiagnosticCollection('local-github-actions');
    const yamlSelector = {
        scheme: 'file',
        pattern: '**/.github/{workflows,actions}/*.{yml,yaml}'
    };
    context.subscriptions.push(
        Validator.collection,
        languages.registerDocumentLinkProvider(
            yamlSelector,
            new LocalFileDocumentLinkProvider()
        ),
        languages.registerCompletionItemProvider(
            yamlSelector, new AutoCompleteProvider()
        )
    );
}

export function deactivate() {
    Validator.collection = undefined;
}
