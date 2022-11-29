import * as vscode from "vscode";
import { Event, Uri } from "vscode";
import { i18n } from '@/common/i18n/localize';
import { createDecorator, InstantiationService, ServiceCollection } from "@/common/ioc";
import { IExtensionContext } from "@/interface";

export interface PythonExtensionApi {
    /**
     * Promise indicating whether all parts of the extension have completed loading or not.
     * @type {Promise<void>}
     * @memberof IExtensionApi
     */
    ready: Promise<void>;
    jupyter: {
        registerHooks(): void;
    };
    debug: {
        /**
         * Generate an array of strings for commands to pass to the Python executable to launch the debugger for remote debugging.
         * Users can append another array of strings of what they want to execute along with relevant arguments to Python.
         * E.g `['/Users/..../pythonVSCode/pythonFiles/lib/python/debugpy', '--listen', 'localhost:57039', '--wait-for-client']`
         * @param {string} host
         * @param {number} port
         * @param {boolean} [waitUntilDebuggerAttaches=true]
         * @returns {Promise<string[]>}
         */
        getRemoteLauncherCommand(host: string, port: number, waitUntilDebuggerAttaches: boolean): Promise<string[]>;

        /**
         * Gets the path to the debugger package used by the extension.
         * @returns {Promise<string>}
         */
        getDebuggerPackagePath(): Promise<string | undefined>;
    };
    /**
     * Return internal settings within the extension which are stored in VSCode storage
     */
    settings: {
        /**
         * An event that is emitted when execution details (for a resource) change. For instance, when interpreter configuration changes.
         */
        readonly onDidChangeExecutionDetails: Event<Uri | undefined>;
        /**
         * Returns all the details the consumer needs to execute code within the selected environment,
         * corresponding to the specified resource taking into account any workspace-specific settings
         * for the workspace to which this resource belongs.
         * @param {Resource} [resource] A resource for which the setting is asked for.
         * * When no resource is provided, the setting scoped to the first workspace folder is returned.
         * * If no folder is present, it returns the global setting.
         * @returns {({ execCommand: string[] | undefined })}
         */
        getExecutionDetails(
            resource?: any,
        ): {
            /**
             * E.g of execution commands returned could be,
             * * `['<path to the interpreter set in settings>']`
             * * `['<path to the interpreter selected by the extension when setting is not set>']`
             * * `['conda', 'run', 'python']` which is used to run from within Conda environments.
             * or something similar for some other Python environments.
             *
             * @type {(string[] | undefined)} When return value is `undefined`, it means no interpreter is set.
             * Otherwise, join the items returned using space to construct the full execution command.
             */
            execCommand: string[] | undefined;
        };
    };

    datascience: {
        /**
         * Launches Data Viewer component.
         * @param {IDataViewerDataProvider} dataProvider Instance that will be used by the Data Viewer component to fetch data.
         * @param {string} title Data Viewer title
         */
        showDataViewer(dataProvider: any, title: string): Promise<void>;
        /**
         * Registers a remote server provider component that's used to pick remote jupyter server URIs
         * @param serverProvider object called back when picking jupyter server URI
         */
        registerRemoteServerProvider(serverProvider: any): void;
    };
}

export interface IPythonExtension {
    readonly pythonExtension: vscode.Extension<PythonExtensionApi> | undefined;
    readonly pythonPath: string;
    waitPythonExtensionInited: () => Promise<void>;
    onPythonPathChange: (callback: (pythonPath: string) => any) => void;
}

export const IPythonExtension = createDecorator<IPythonExtension>('pythonExtension');

export class PythonExtension implements IPythonExtension {
    private _pythonExtension: vscode.Extension<PythonExtensionApi> | undefined;
    constructor(@IExtensionContext private _context: IExtensionContext) {
        this.updatePythonExtension();
    }

    static Create(instantiation: InstantiationService, service?: ServiceCollection) {
        const instance = instantiation.createInstance<IPythonExtension>(this);
        if (service) {
            service.set(IPythonExtension, instance);
        }
        return instance;
    }

    updatePythonExtension() {
        this._pythonExtension = vscode.extensions.getExtension<PythonExtensionApi>('ms-python.python');
    }

    get pythonExtension() {
        if (this._pythonExtension) {
            return this._pythonExtension;
        }
        this.updatePythonExtension();
        return this._pythonExtension;
    }

    getPythonPath() {
        if (!this.pythonExtension) {
            return '';
        }
        const executionDetails = this.pythonExtension.exports.settings.getExecutionDetails();
        return executionDetails?.execCommand?.[0] || '';
    }

    get pythonPath() {
        return this.getPythonPath();
    }

    private waitPythonPath() {
        let timer: NodeJS.Timeout | null = null;
        return new Promise<string>((resolve, reject) => {
            const tryResolvePythonPath = () => {
                const pythonPath = this.getPythonPath();
                if (pythonPath) {
                    resolve(pythonPath);
                }
            };

            tryResolvePythonPath();
            timer = setInterval(tryResolvePythonPath, 1000);
        }).finally(() => {
            if (timer !== null) {
                clearInterval(timer);
            }
        });
    }

    async waitPythonExtensionInited() {
        await this.waitPythonPath();
    }

    onPythonPathChange(callback: (pythonPath: string) => any) {
        const dispose = this.pythonExtension?.exports.settings.onDidChangeExecutionDetails(() => {
            const pythonPath = this.getPythonPath();
            return callback(pythonPath);
        });
        if (dispose) {
            this._context.subscriptions.push(dispose);
        }
    };
}