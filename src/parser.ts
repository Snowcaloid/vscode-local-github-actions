import { Position, Range, TextDocument, Uri } from "vscode";
import * as YAML from 'yaml';

export const ACTION = 'action';
export const WORKFLOW = 'workflow';
export const JOBS = 'jobs';
export const STEPS = 'steps';
export const USES = 'uses';
export const RUNS = 'runs';
export const USING = 'using';
export const WITH = 'with';
export const ENV = 'env';
export const COMPOSITE = 'composite';
export const LOCAL_START = /^\.{1,2}\/.*/;

export class UsesReference {
    public file?: Uri = undefined;
    constructor(
        public readonly content: string,
        public readonly type: 'workflow' | 'action',
        public readonly range: Range) { }
}

export class LocalFileUsesParser {
    public static parse(document: TextDocument): UsesReference[] {
        const yaml = YAML.parseDocument(document.getText());
        if (!yaml) return [];
        return [
            ...this.extractUsesFromWorkflow(yaml, document),
            ...this.extractUsesFromAction(yaml, document)
        ];
    }

    private static extractUsesFromWorkflow(yaml: YAML.Document.Parsed, document: TextDocument): UsesReference[] {
        const usesReferences: UsesReference[] = [];

        // Navigate to the jobs section
        const jobs = yaml.get(JOBS);
        if (!jobs || !YAML.isMap(jobs)) return usesReferences;

        // Iterate through each job
        for (const jobEntry of jobs.items) {
            const jobValue = jobEntry.value;
            if (!YAML.isMap(jobValue)) continue;

            // Check for 'uses' at job level (workflow type)
            const jobUsesNode = jobValue.items.find(item =>
                YAML.isScalar(item.key) && item.key.value === USES
            );
            if (jobUsesNode && YAML.isScalar(jobUsesNode.value)) {
                const jobUses = jobUsesNode.value.value as string;
                if (!LOCAL_START.test(jobUses)) continue;
                const range = this.getNodeRange(jobUsesNode.value, document);
                usesReferences.push(new UsesReference(
                    jobUses,
                    WORKFLOW,
                    range
                ));
            }

            // Check for steps array in the job
            const steps = jobValue.get(STEPS);
            if (!steps || !YAML.isSeq(steps)) continue;

            // Iterate through each step
            for (const step of steps.items) {
                if (!YAML.isMap(step)) continue;

                const stepUsesNode = step.items.find(item =>
                    YAML.isScalar(item.key) && item.key.value === USES
                );
                // Check for 'uses' at step level (action type)
                if (stepUsesNode?.value && YAML.isScalar(stepUsesNode.value)) {
                    const stepUses = stepUsesNode.value.value as string;
                    if (!LOCAL_START.test(stepUses)) continue;

                    const range = this.getNodeRange(stepUsesNode.value, document);
                    usesReferences.push(new UsesReference(
                        stepUses,
                        ACTION,
                        range
                    ));
                }
            }
        }

        return usesReferences;
    }

    private static extractUsesFromAction(yaml: YAML.Document.Parsed, document: TextDocument): UsesReference[] {
        const usesReferences: UsesReference[] = [];

        // Navigate to the runs section
        const runs = yaml.get(RUNS);
        if (!runs || !YAML.isMap(runs)) return usesReferences;

        // Check if using composite
        const using = runs.get(USING);
        if (!using || !YAML.isScalar(using) || using.value !== COMPOSITE) {
            return usesReferences;
        }

        // Check for steps array in runs
        const steps = runs.get(STEPS);
        if (!steps || !YAML.isSeq(steps)) return usesReferences;

        // Iterate through each step (same logic as workflow steps)
        for (const step of steps.items) {
            if (!YAML.isMap(step)) continue;

            // Check for 'uses' at step level (action type)
            const stepUses = step.get(USES);
            if (stepUses && YAML.isScalar(stepUses) && stepUses.value && LOCAL_START.test(stepUses.value as string)) {
                const range = this.getNodeRange(stepUses, document);
                usesReferences.push(new UsesReference(
                    stepUses.value as string,
                    ACTION,
                    range
                ));
            }
        }

        return usesReferences;
    }

    private static getNodeRange(node: YAML.Node, document: TextDocument): Range {
        // Get the source range from the YAML node
        const range = node.range;
        if (!range) {
            // Fallback to document start if no range available
            return new Range(new Position(0, 0), new Position(0, 0));
        }

        // Convert byte offsets to line/character positions
        const startPos = document.positionAt(range[0]);
        const endPos = document.positionAt(range[1]);

        return new Range(startPos, endPos);
    }
}