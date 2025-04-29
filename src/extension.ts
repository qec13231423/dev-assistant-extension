import * as vscode from 'vscode';

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI("");

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('dev-assistant.openPanel', () => {
    const panel = vscode.window.createWebviewPanel(
      'devAssistant',
      'Dev Assistant',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = getWebviewContent();

    panel.webview.onDidReceiveMessage((message: { command: string }) => {
      handleCommand(message.command);
    });
  });

  context.subscriptions.push(disposable);
}

async function handleCommand(command: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  try {
    switch (command) {
      case 'generateTests':
        vscode.window.showInformationMessage('🧪 Generating unit tests...');
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showWarningMessage('No active file selected');
          return;
        }

        const codeForTests = activeEditor.document.getText();
        const testPrompt = `Generate unit tests for this code:\n${codeForTests}`;

        const testResult = await model.generateContent(testPrompt);
        const testResponse = await testResult.response;

        // Create a new file with the generated tests
        const testDoc = await vscode.workspace.openTextDocument({
          content: testResponse.text(),
          language: 'typescript'
        });
        await vscode.window.showTextDocument(testDoc);
        break;

      case 'fixSnyk':
        vscode.window.showInformationMessage('🔧 Analyzing security vulnerabilities...');
        const vulnEditor = vscode.window.activeTextEditor;
        if (!vulnEditor) {
          vscode.window.showWarningMessage('No active file selected');
          return;
        }

        const codeToFix = vulnEditor.document.getText();
        const securityPrompt = `Analyze this code for security vulnerabilities and suggest fixes:\n${codeToFix}`;

        const securityResult = await model.generateContent(securityPrompt);
        const securityResponse = await securityResult.response;

        // Show security recommendations in a new document
        const securityDoc = await vscode.workspace.openTextDocument({
          content: securityResponse.text(),
          language: 'markdown'
        });
        await vscode.window.showTextDocument(securityDoc);
        break;

      default:
        vscode.window.showWarningMessage(`Unknown command: ${command}`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function getWebviewContent(): string {
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
        const vscode = acquireVsCodeApi();
        function sendMessage(command) {
          vscode.postMessage({ command });
        }
      </script>
    </body>
    </html>
  `;
}
