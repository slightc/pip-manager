import * as vscode from 'vscode';
import axios from 'axios';

export function createAxiosCancelToken(cancelToken?: vscode.CancellationToken){
    const axiosCancelToken = axios.CancelToken.source();
    cancelToken?.onCancellationRequested(()=>{
        axiosCancelToken.cancel();
    })
    return axiosCancelToken;
}