export declare function connectDB(): Promise<any>;
/**
 * Exported DB – use only after `await connectDB()` somewhere (e.g. in server.ts)
 */
export declare const db: {
    readonly collection: (name: string) => any;
};
//# sourceMappingURL=Connection.d.ts.map