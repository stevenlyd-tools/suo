export declare const writerPath = "suo/writer.json";
export interface WriterIdentity {
    schemaVersion: 1;
    tool: 'suo';
    version: string;
    skillDigest: string;
    runtimeDigest: string;
}
export declare function compareWriterVersions(actual: string, recorded: string): number;
export declare function validateWriter(value: unknown): asserts value is WriterIdentity;
export declare const currentWriter: () => Promise<WriterIdentity>;
/** Skill identity of a package root or bare Skill directory, read as data: nothing under `path` is imported or executed. */
export declare function skillIdentity(path: string): Promise<{
    version: string;
    skillDigest: string;
}>;
/** Parity of a loaded Skill (for example a native plugin cache without dependencies) with this executing runtime. */
export declare function checkSkill(path: string): Promise<{
    matches: boolean;
    version: string;
    skillDigest: string;
    path: string;
}>;
export declare function readWriter(root: string, path?: string): Promise<WriterIdentity | null>;
export declare function requireCompatibleWriter(installed: WriterIdentity, recorded: WriterIdentity | null): 'unrecorded' | 'same' | 'newer';
export declare function checkWriter(root: string, skillPath?: string): Promise<{
    compatibility: "unrecorded" | "same" | "newer";
    path: string;
    notice: string;
    skill?: {
        matches: boolean;
        version: string;
        skillDigest: string;
        path: string;
    };
    installed: WriterIdentity;
    recorded: WriterIdentity | null;
}>;
export declare const writerContents: (writer: WriterIdentity) => string;
/** For Skill edits or external renderers. No product replacement, Git commit or other tool record. */
export declare function recordWriter(root: string): Promise<void>;
