import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'settings.plugin.item': {
            kind: 'list';
            scope: 'root';
            owner: {
                children?: never;
            };
        };
    }
}
type DesignSettingsCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'genui'>;
export declare function designIdForImport(fileName: string, content: string, now?: number): string;
export declare function DesignSettingsCard({ t }: DesignSettingsCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=design-settings.d.ts.map