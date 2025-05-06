import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI("");

export function activate(context: vscode.ExtensionContext) {
  // Register the custom sidebar provider
  const provider = new DevAssistantViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('dev-assistant-view', provider)
  );

  // Register the command to apply security fix
  context.subscriptions.push(
    vscode.commands.registerCommand('dev-assistant.applyCurrentFix', async () => {
      await provider.applyFix();
    })
  );
}

class DevAssistantViewProvider implements vscode.WebviewViewProvider {
  private webviewView?: vscode.WebviewView;
  private currentDocument?: vscode.TextDocument;
  private fixedCode?: string;
  private statusBarItem?: vscode.StatusBarItem;
  private diffEditorOpen: boolean = false;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'applyFix') {
        await this.applyFix();
      } else if (message.command === 'viewDiff') {
        await this.viewDiff();
      } else if (message.command === 'cancelFix') {
        this.hideFixOptions();
      } else {
        await handleCommand(message.command, this);
      }
    });
  }

  public showFixOptions(fixedCode: string, document: vscode.TextDocument) {
    this.fixedCode = fixedCode;
    this.currentDocument = document;
    
    if (this.webviewView) {
      this.webviewView.webview.postMessage({ 
        command: 'showFixOptions' 
      });
    }
  }

  public hideFixOptions() {
    if (this.webviewView) {
      this.webviewView.webview.postMessage({ 
        command: 'hideFixOptions' 
      });
    }
    
    this.fixedCode = undefined;
    this.currentDocument = undefined;
    
    // Clean up any remaining UI elements
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
    
    this.diffEditorOpen = false;
  }

  public async applyFix() {
    if (!this.fixedCode || !this.currentDocument) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      this.currentDocument.positionAt(0),
      this.currentDocument.positionAt(this.currentDocument.getText().length)
    );
    
    edit.replace(this.currentDocument.uri, fullRange, this.fixedCode);
    await vscode.workspace.applyEdit(edit);
    
    vscode.window.showInformationMessage('Security fix applied!');
    this.hideFixOptions();
    
    // Close any open diff editors
    if (this.diffEditorOpen) {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  }

  private async viewDiff() {
    if (!this.fixedCode || !this.currentDocument) {
      return;
    }

    // Create a temporary file with the fixed code
    const tempDoc = await vscode.workspace.openTextDocument({
      content: this.fixedCode,
      language: this.currentDocument.languageId
    });

    // Use VS Code's built-in diff view but make it more integrated
    await vscode.commands.executeCommand('vscode.diff', 
      this.currentDocument.uri, 
      tempDoc.uri, 
      'Suggested Security Fix (Apply to save changes)', 
      {
        preview: true,           // Open in preview mode
        viewColumn: vscode.ViewColumn.Active, // Open in the active editor group
        preserveFocus: false     // Focus the diff view
      }
    );
    
    this.diffEditorOpen = true;

    // Add a status bar item to easily apply changes
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = "$(shield) Apply Security Fix";
    this.statusBarItem.tooltip = "Apply the suggested security fix to the original file";
    this.statusBarItem.command = "dev-assistant.applyCurrentFix";
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.statusBarItem.show();

    // Clean up when the diff editor is closed
    const watcher = vscode.window.onDidChangeActiveTextEditor(editor => {
      if (!editor || (this.diffEditorOpen && !editor.document.fileName.includes('[Diff]'))) {
        if (this.statusBarItem) {
          this.statusBarItem.dispose();
        }
        watcher.dispose();
        this.diffEditorOpen = false;
      }
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
          .fix-options {
            display: none;
            margin-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 15px;
          }
          .fix-options h3 {
            margin-top: 0;
          }
          .apply-fix {
            background: var(--vscode-button-background);
          }
          .view-diff {
            background: var(--vscode-statusBarItem-warningBackground);
          }
          .cancel-fix {
            background: var(--vscode-statusBarItem-errorBackground);
          }
        </style>
      </head>
      <body>
        <button onclick="sendMessage('generateTests')">🧪 Generate Unit Tests</button>
        <button onclick="sendMessage('fixSnyk')">🔧 Fix Snyk Vulnerabilities</button>
        
        <div id="fixOptions" class="fix-options">
          <h3>Security Fix Available</h3>
          <p>A fix has been generated for the security issues. What would you like to do?</p>
          <button class="apply-fix" onclick="sendMessage('applyFix')">✅ Apply Fix</button>
          <button class="view-diff" onclick="sendMessage('viewDiff')">👀 View Changes</button>
          <button class="cancel-fix" onclick="sendMessage('cancelFix')">❌ Cancel</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function sendMessage(command) {
            vscode.postMessage({ command });
          }
          
          // Listen for messages from the extension
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
              case 'showFixOptions':
                document.getElementById('fixOptions').style.display = 'block';
                break;
              case 'hideFixOptions':
                document.getElementById('fixOptions').style.display = 'none';
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}

async function handleCommand(command: string, provider?: DevAssistantViewProvider) {
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
        let currentDocument: vscode.TextDocument | undefined;
        let currentEditor: vscode.TextEditor | undefined;

        const vulnEditor = vscode.window.activeTextEditor;
        if (vulnEditor) {
          const selection = vulnEditor.selection;
          codeToFix = vulnEditor.document.getText(selection.isEmpty ? undefined : selection);
          currentDocument = vulnEditor.document;
          currentEditor = vulnEditor;
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

          currentDocument = await vscode.workspace.openTextDocument(fileUri.uri);
          codeToFix = currentDocument.getText();
          currentEditor = await vscode.window.showTextDocument(currentDocument);
        }

        if (!codeToFix || codeToFix.trim() === '') {
          vscode.window.showWarningMessage('No code selected or file is empty.');
          return;
        }

        // Update the security prompt to get a cleaner response format
        const securityPrompt = `
          Analyze this code for security vulnerabilities:
          ${codeToFix}
          
          Format your response EXACTLY as follows:
          1. Put all explanations ONLY as code comments using // at the beginning of each line
          2. After your comments, add a line with ONLY: "// --- FIXED CODE BELOW ---"
          3. Then provide the COMPLETE fixed code with no additional explanations
          4. Do not use markdown, code blocks, or backticks
        `;
        
        console.log('Sending prompt to genAI:', securityPrompt);

        const securityResult = await model.generateContent(securityPrompt);
        const securityResponse = await securityResult.response;
        const responseText = securityResponse.text();
        
        // Show the analysis in a new document
        const analysisDoc = await vscode.workspace.openTextDocument({
          content: responseText,
          language: currentDocument ? currentDocument.languageId : 'typescript'
        });
        await vscode.window.showTextDocument(analysisDoc, vscode.ViewColumn.Beside);
        
        // Extract the fixed code using the delimiter
        const parts = responseText.split('// --- FIXED CODE BELOW ---');
        
        // If we can identify a code part after the delimiter
        if (parts.length >= 2 && provider && currentDocument) {
          const fixedCode = parts[1].trim();
          
          // Show fix options in the webview
          provider.showFixOptions(fixedCode, currentDocument);
        } else {
          vscode.window.showWarningMessage('Could not extract a clean solution from the AI response. Check if the delimiter "// --- FIXED CODE BELOW ---" is present.');
        }
        
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
