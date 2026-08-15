interface DropConnectionEmailParams {
    to: string[];
    connectionName: string;
    companyName: string;
    code?: number;
    reason?: string;
}
export declare function sendDropConnectionEmail(params: DropConnectionEmailParams): Promise<void>;
export {};
//# sourceMappingURL=resend.service.d.ts.map