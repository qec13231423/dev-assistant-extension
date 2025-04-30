"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = require("vscode");
const generative_ai_1 = require("@google/generative-ai");
const genAI = new generative_ai_1.GoogleGenerativeAI("");
function activate(context) {
    console.log('Dev Assistant extension activated.');
    const disposable = vscode.commands.registerCommand('dev-assistant.openPanel', () => {
        const panel = vscode.window.createWebviewPanel('devAssistant', 'Dev Assistant', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.webview.html = getWebviewContent();
        panel.webview.onDidReceiveMessage((message) => {
            console.log(`Message received from WebView: ${JSON.stringify(message)}`);
            handleCommand(message.command);
        });
    });
    context.subscriptions.push(disposable);
}
async function handleCommand(command) {
    console.log(`handleCommand triggered with command: ${command}`);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    try {
        switch (command) {
            case 'generateTests': {
                vscode.window.showInformationMessage('🧪 Generating unit tests...');
                console.log('Preparing to call genAI for unit test generation.');
                let codeForTests;
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    const selection = activeEditor.selection;
                    codeForTests = activeEditor.document.getText(selection.isEmpty ? undefined : selection);
                }
                else {
                    // Prompt the user to select a file if no active editor is found
                    vscode.window.showWarningMessage('No active file. Please select a file.');
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        openLabel: 'Select a file',
                        filters: {
                            'Code files': ['ts', 'js', 'py', 'java', 'go', 'cs'],
                            'All files': ['*']
                        }
                    });
                    if (!fileUri || fileUri.length === 0) {
                        vscode.window.showErrorMessage('No file selected. Operation cancelled.');
                        return;
                    }
                    const document = await vscode.workspace.openTextDocument(fileUri[0]);
                    codeForTests = document.getText();
                    await vscode.window.showTextDocument(document);
                }
                if (!codeForTests || codeForTests.trim() === '') {
                    vscode.window.showWarningMessage('No code selected or file is empty.');
                    return;
                }
                const testPrompt = `Generate unit tests for this code:\n${codeForTests}`;
                console.log('Sending prompt to genAI:', testPrompt);
                const testResult = await model.generateContent(testPrompt);
                const testResponse = await testResult.response;
                const testDoc = await vscode.workspace.openTextDocument({
                    content: testResponse.text(),
                    language: 'typescript'
                });
                await vscode.window.showTextDocument(testDoc);
                break;
            }
            case 'fixSnyk': {
                vscode.window.showInformationMessage('🔧 Analyzing security vulnerabilities...');
                console.log('Preparing to call genAI for security analysis.');
                let codeToFix;
                const vulnEditor = vscode.window.activeTextEditor;
                if (vulnEditor) {
                    const selection = vulnEditor.selection;
                    codeToFix = vulnEditor.document.getText(selection.isEmpty ? undefined : selection);
                }
                else {
                    // Prompt the user to select a file if no active editor is found
                    vscode.window.showWarningMessage('No active file. Please select a file.');
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        openLabel: 'Select a file',
                        filters: {
                            'Code files': ['ts', 'js', 'py', 'java', 'go', 'cs'],
                            'All files': ['*']
                        }
                    });
                    if (!fileUri || fileUri.length === 0) {
                        vscode.window.showErrorMessage('No file selected. Operation cancelled.');
                        return;
                    }
                    const document = await vscode.workspace.openTextDocument(fileUri[0]);
                    codeToFix = document.getText();
                    await vscode.window.showTextDocument(document);
                }
                if (!codeToFix || codeToFix.trim() === '') {
                    vscode.window.showWarningMessage('No code selected or file is empty.');
                    return;
                }
                const securityPrompt = `Analyze this code for security vulnerabilities and suggest fixes:\n${codeToFix}`;
                console.log('Sending prompt to genAI:', securityPrompt);
                const securityResult = await model.generateContent(securityPrompt);
                const securityResponse = await securityResult.response;
                const securityDoc = await vscode.workspace.openTextDocument({
                    content: securityResponse.text(),
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(securityDoc);
                break;
            }
            default:
                vscode.window.showWarningMessage(`Unknown command: ${command}`);
        }
    }
    catch (error) {
        console.error('Error during handleCommand:', error);
        vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Dev Assistant</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 20px;
          background-color: #1e1e1e;
          color: #d4d4d4;
        }
        h2 {
          font-size: 1.5rem;
          margin-bottom: 1em;
        }
        button {
          background-color: #007acc;
          color: white;
          border: none;
          padding: 10px 16px;
          margin: 8px 0;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1rem;
          transition: background-color 0.3s;
        }
        button:hover {
          background-color: #005f9e;
        }
      </style>
    </head>
    <body>
      <h2>🛠️ Dev Assistant</h2>
      <button onclick="sendMessage('generateTests')">🧪 Generate Unit Tests</button>
      <button onclick="sendMessage('fixSnyk')">🔧 Fix Snyk Vulnerabilities</button>

      <script>
        // Define the sendMessage function globally
        const vscode = acquireVsCodeApi();
        window.sendMessage = function (command) {
          console.log('Sending message to extension:', command); // Log in WebView
          vscode.postMessage({ command });
        };
      </script>
    </body>
    </html>
  `;
}
//# sourceMappingURL=extension.js.map
