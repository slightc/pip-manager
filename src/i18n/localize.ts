import zhCn from './zh-cn';

export class I18n {
    private locale: string = 'en';
    private messages: Record<string, Record<string, string>> = {};
    private currentMessage: Record<string, string> = {};
    constructor() {
        if (process.env.VSCODE_NLS_CONFIG) {
            try {
                const config = JSON.parse(process.env.VSCODE_NLS_CONFIG);
                this.locale = config['locale'];
            } catch (error) {/* ignore */ }
        }

        this.messages = Object.assign(zhCn);
        this.currentMessage = this.messages[this.locale];
    }

    localize(key: string, defaultValue: string, ...args: string[]): string {
        const message = this.currentMessage[key] || defaultValue;
        return message.replace(/\%\d+\%/g, (match: string) => {
            const index = match.replace(/[\%]/g, '');
            return args[Number(index)] || '';
        });
    }
}

export const i18n = new I18n();