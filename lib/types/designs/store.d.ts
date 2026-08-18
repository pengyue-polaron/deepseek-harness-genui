export interface StoredDesign {
    id: string;
    title: string;
    content: string;
}
export declare class DesignStore {
    readonly root: string;
    private selectedDefault;
    constructor(root: string);
    init(): Promise<void>;
    defaultId(): string | undefined;
    isBuiltin(id: string): boolean;
    setDefault(id: string | undefined): Promise<void>;
    list(): Promise<Array<Pick<StoredDesign, 'id' | 'title'>>>;
    get(id: string): Promise<StoredDesign>;
    put(id: string, content: string): Promise<StoredDesign>;
    private path;
    private settingsPath;
}
//# sourceMappingURL=store.d.ts.map