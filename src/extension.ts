import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI("");

export function activate(context: vscode.ExtensionContext) {
  // Register the custom sidebar provider
  const provider = new DevAssistantViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('dev-assistant-view', provider)
  );
}

class DevAssistantViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await handleCommand(message.command);
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dev Assistant</title>
        <style>
          body {
            padding: 10px;
          }
          button {
            width: 100%;
            padding: 8px;
            margin: 4px 0;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
          }
          button:hover {
            background: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
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
}

async function handleCommand(command: string) {
  console.log(`handleCommand triggered with command: ${command}`);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
  
  try {
    switch (command) {
      case 'generateTests': {
        vscode.window.showInformationMessage('🧪 Generating unit tests...');
        console.log('Preparing to call genAI for unit test generation.');
        let codeForTests: string | undefined;

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const selection = activeEditor.selection;
          codeForTests = activeEditor.document.getText(selection.isEmpty ? undefined : selection);
        } else {
          // Allow the user to select a file from the workspace
          const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
          if (files.length === 0) {
            vscode.window.showWarningMessage('No files found in the workspace.');
            return;
          }

          const fileUri = await vscode.window.showQuickPick(
            files.map(file => ({
              label: vscode.workspace.asRelativePath(file),
              description: file.fsPath,
              uri: file
            })),
            {
              placeHolder: 'Select a file from the workspace',
              canPickMany: false
            }
          );

          if (!fileUri) {
            vscode.window.showErrorMessage('No file selected. Operation cancelled.');
            return;
          }

          const document = await vscode.workspace.openTextDocument(fileUri.uri);
          codeForTests = document.getText();
          await vscode.window.showTextDocument(document);
        }

        if (!codeForTests || codeForTests.trim() === '') {
          vscode.window.showWarningMessage('No code selected or file is empty.');
          return;
        }

        const testPrompt = `Generate only the code for unit tests. No explanations, no markdown formatting, just the raw code:\n${codeForTests}`;
        console.log('Sending prompt to genAI:', testPrompt);

        const testResult = await model.generateContent(testPrompt);
        const testResponse = await testResult.response;

        // Clean up the response to get pure code
        let cleanCode = testResponse.text()
        .replace(/```[a-z]*\n/g, '') // Remove opening code fence
        .replace(/```\n?/g, '')      // Remove closing code fence
        .trim();                     // Remove extra whitespace

        const testDoc = await vscode.workspace.openTextDocument({
          content: cleanCode,
          language: 'typescript'
        });
        await vscode.window.showTextDocument(testDoc);
        break;
      }

      case 'fixSnyk': {
        vscode.window.showInformationMessage('🔧 Analyzing security vulnerabilities...');
        console.log('Preparing to call genAI for security analysis.');
        let codeToFix: string | undefined;

        const vulnEditor = vscode.window.activeTextEditor;
        if (vulnEditor) {
          const selection = vulnEditor.selection;
          codeToFix = vulnEditor.document.getText(selection.isEmpty ? undefined : selection);
        } else {
          // Allow the user to select a file from the workspace
          const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
          if (files.length === 0) {
            vscode.window.showWarningMessage('No files found in the workspace.');
            return;
          }

          const fileUri = await vscode.window.showQuickPick(
            files.map(file => ({
              label: vscode.workspace.asRelativePath(file),
              description: file.fsPath,
              uri: file
            })),
            {
              placeHolder: 'Select a file from the workspace',
              canPickMany: false
            }
          );

          if (!fileUri) {
            vscode.window.showErrorMessage('No file selected. Operation cancelled.');
            return;
          }

          const document = await vscode.workspace.openTextDocument(fileUri.uri);
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
  } catch (error) {
    console.error('Error during handleCommand:', error);
    vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
