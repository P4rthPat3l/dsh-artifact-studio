import type { ArtifactType } from '../contract.js';

/** Starter content for a page made from the panel; it uses the design tokens so a token change shows at once. */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<style>
  body {
    margin: 0;
    font-family: var(--artifact-font-family);
    color: var(--artifact-color-text);
    background: var(--artifact-color-surface);
  }
  main { max-width: 720px; margin: 0 auto; padding: var(--artifact-space-6) var(--artifact-space-4); }
  h1 { font-size: var(--artifact-font-size-5); margin: 0 0 var(--artifact-space-2); letter-spacing: -0.02em; }
  h1 { font-family: var(--artifact-font-display); }
  p { color: var(--artifact-color-muted); line-height: 1.6; }
</style>
</head>
<body>
<main>
  <h1>{{title}}</h1>
  <p>Select any text and choose Edit with agent, or edit the code yourself.</p>
</main>
</body>
</html>
`;

const DOC = `# {{title}}

Start writing, or select text and choose Edit with agent.
`;

/** Starter workbook; the title is inserted as a JSON string, never as code. */
function sheetTemplate(title: string): string {
  const workbook = {
    schemaVersion: 1,
    sheets: [
      {
        name: 'Sheet1',
        cells: {
          A1: { value: title, style: { bold: true } },
          A3: 'Item',
          B3: 'Amount',
          A4: 'Example',
          B4: 100,
          B5: 'Total',
          B6: '=SUM(B4:B5)',
        },
        columnWidths: { A: 180 },
      },
    ],
  };
  return JSON.stringify(workbook, null, 2) + '\n';
}

/** Starter whiteboard scene; the title is inserted as a JSON string, never as code. */
const BOARD_SCENE = "{\n  \"type\": \"excalidraw\",\n  \"version\": 2,\n  \"source\": \"dsh-artifact-studio\",\n  \"elements\": [\n    {\n      \"id\": \"4e6891a1765747dc91c1\",\n      \"type\": \"text\",\n      \"x\": 80,\n      \"y\": 56,\n      \"width\": 178.56,\n      \"height\": 40,\n      \"angle\": 0,\n      \"strokeColor\": \"#1e1e1e\",\n      \"backgroundColor\": \"transparent\",\n      \"fillStyle\": \"solid\",\n      \"strokeWidth\": 2,\n      \"strokeStyle\": \"solid\",\n      \"roughness\": 1,\n      \"opacity\": 100,\n      \"roundness\": null,\n      \"seed\": 1286361939,\n      \"version\": 1,\n      \"versionNonce\": 813623366,\n      \"index\": null,\n      \"isDeleted\": false,\n      \"groupIds\": [],\n      \"frameId\": null,\n      \"boundElements\": null,\n      \"updated\": 1795067514422,\n      \"link\": null,\n      \"locked\": false,\n      \"text\": \"{{title}}\",\n      \"originalText\": \"{{title}}\",\n      \"fontSize\": 32,\n      \"fontFamily\": 5,\n      \"textAlign\": \"left\",\n      \"verticalAlign\": \"top\",\n      \"containerId\": null,\n      \"autoResize\": true,\n      \"lineHeight\": 1.25\n    },\n    {\n      \"id\": \"26161620d0934d5ab33e\",\n      \"type\": \"text\",\n      \"x\": 80,\n      \"y\": 104,\n      \"width\": 416.64,\n      \"height\": 20,\n      \"angle\": 0,\n      \"strokeColor\": \"#5b6170\",\n      \"backgroundColor\": \"transparent\",\n      \"fillStyle\": \"solid\",\n      \"strokeWidth\": 2,\n      \"strokeStyle\": \"solid\",\n      \"roughness\": 1,\n      \"opacity\": 100,\n      \"roundness\": null,\n      \"seed\": 1041333132,\n      \"version\": 1,\n      \"versionNonce\": 1850781392,\n      \"index\": null,\n      \"isDeleted\": false,\n      \"groupIds\": [],\n      \"frameId\": null,\n      \"boundElements\": null,\n      \"updated\": 1795067514422,\n      \"link\": null,\n      \"locked\": false,\n      \"text\": \"Sketch the idea, then edit with the agent.\",\n      \"originalText\": \"Sketch the idea, then edit with the agent.\",\n      \"fontSize\": 16,\n      \"fontFamily\": 5,\n      \"textAlign\": \"left\",\n      \"verticalAlign\": \"top\",\n      \"containerId\": null,\n      \"autoResize\": true,\n      \"lineHeight\": 1.25\n    },\n    {\n      \"id\": \"4f278f6e2c7b40788f24\",\n      \"type\": \"rectangle\",\n      \"x\": 80,\n      \"y\": 176,\n      \"width\": 240,\n      \"height\": 96,\n      \"angle\": 0,\n      \"strokeColor\": \"#1971c2\",\n      \"backgroundColor\": \"#a5d8ff\",\n      \"fillStyle\": \"solid\",\n      \"strokeWidth\": 2,\n      \"strokeStyle\": \"solid\",\n      \"roughness\": 1,\n      \"opacity\": 100,\n      \"roundness\": {\n        \"type\": 3\n      },\n      \"seed\": 89916226,\n      \"version\": 1,\n      \"versionNonce\": 535646685,\n      \"index\": null,\n      \"isDeleted\": false,\n      \"groupIds\": [],\n      \"frameId\": null,\n      \"boundElements\": null,\n      \"updated\": 1795067514423,\n      \"link\": null,\n      \"locked\": false\n    },\n    {\n      \"id\": \"6a0067b48a3c42c5ae9a\",\n      \"type\": \"text\",\n      \"x\": 138,\n      \"y\": 211.5,\n      \"width\": 124,\n      \"height\": 25,\n      \"angle\": 0,\n      \"strokeColor\": \"#1e1e1e\",\n      \"backgroundColor\": \"transparent\",\n      \"fillStyle\": \"solid\",\n      \"strokeWidth\": 2,\n      \"strokeStyle\": \"solid\",\n      \"roughness\": 1,\n      \"opacity\": 100,\n      \"roundness\": null,\n      \"seed\": 962063446,\n      \"version\": 1,\n      \"versionNonce\": 676482649,\n      \"index\": null,\n      \"isDeleted\": false,\n      \"groupIds\": [],\n      \"frameId\": null,\n      \"boundElements\": null,\n      \"updated\": 1795067514423,\n      \"link\": null,\n      \"locked\": false,\n      \"text\": \"Start here\",\n      \"originalText\": \"Start here\",\n      \"fontSize\": 20,\n      \"fontFamily\": 5,\n      \"textAlign\": \"left\",\n      \"verticalAlign\": \"top\",\n      \"containerId\": null,\n      \"autoResize\": true,\n      \"lineHeight\": 1.25\n    },\n    {\n      \"id\": \"6bca4634318b4ab88a2e\",\n      \"type\": \"ellipse\",\n      \"x\": 400,\n      \"y\": 176,\n      \"width\": 200,\n      \"height\": 96,\n      \"angle\": 0,\n      \"strokeColor\": \"#2f9e44\",\n      \"backgroundColor\": \"#b2f2bb\",\n      \"fillStyle\": \"solid\",\n      \"strokeWidth\": 2,\n      \"strokeStyle\": \"solid\",\n      \"roughness\": 1,\n      \"opacity\": 100,\n      \"roundness\": null,\n      \"seed\": 1413755410,\n      \"version\": 1,\n      \"versionNonce\": 935083914,\n      \"index\": null,\n      \"isDeleted\": false,\n      \"groupIds\": [],\n      \"frameId\": null,\n      \"boundElements\": null,\n      \"updated\": 1795067514423,\n      \"link\": null,\n      \"locked\": false\n    },\n    {\n      \"id\": \"e2481c1fdcca4ef79688\",\n      \"type\": \"text\",\n      \"x\": 444.2,\n      \"y\": 211.5,\n      \"width\": 111.6,\n      \"height\": 25,\n      \"angle\": 0,\n      \"strokeColor\": \"#1e1e1e\",\n      \"backgroundColor\": \"transparent\",\n      \"fillStyle\": \"solid\",\n      \"strokeWidth\": 2,\n      \"strokeStyle\": \"solid\",\n      \"roughness\": 1,\n      \"opacity\": 100,\n      \"roundness\": null,\n      \"seed\": 1250635567,\n      \"version\": 1,\n      \"versionNonce\": 1486768488,\n      \"index\": null,\n      \"isDeleted\": false,\n      \"groupIds\": [],\n      \"frameId\": null,\n      \"boundElements\": null,\n      \"updated\": 1795067514423,\n      \"link\": null,\n      \"locked\": false,\n      \"text\": \"Next step\",\n      \"originalText\": \"Next step\",\n      \"fontSize\": 20,\n      \"fontFamily\": 5,\n      \"textAlign\": \"left\",\n      \"verticalAlign\": \"top\",\n      \"containerId\": null,\n      \"autoResize\": true,\n      \"lineHeight\": 1.25\n    },\n    {\n      \"id\": \"c931d6cd9a444ea1ad75\",\n      \"type\": \"arrow\",\n      \"x\": 320,\n      \"y\": 224,\n      \"width\": 80,\n      \"height\": 0,\n      \"angle\": 0,\n      \"strokeColor\": \"#1e1e1e\",\n      \"backgroundColor\": \"transparent\",\n      \"fillStyle\": \"solid\",\n      \"strokeWidth\": 2,\n      \"strokeStyle\": \"solid\",\n      \"roughness\": 1,\n      \"opacity\": 100,\n      \"roundness\": null,\n      \"seed\": 638106720,\n      \"version\": 1,\n      \"versionNonce\": 2035424734,\n      \"index\": null,\n      \"isDeleted\": false,\n      \"groupIds\": [],\n      \"frameId\": null,\n      \"boundElements\": null,\n      \"updated\": 1795067514423,\n      \"link\": null,\n      \"locked\": false,\n      \"points\": [\n        [\n          0,\n          0\n        ],\n        [\n          80,\n          0\n        ]\n      ],\n      \"lastCommittedPoint\": null,\n      \"startBinding\": null,\n      \"endBinding\": null,\n      \"startArrowhead\": null,\n      \"endArrowhead\": \"arrow\",\n      \"elbowed\": false\n    }\n  ],\n  \"appState\": {\n    \"viewBackgroundColor\": \"#ffffff\",\n    \"gridSize\": null\n  },\n  \"files\": {}\n}\n";

function boardTemplate(title: string): string {
  return BOARD_SCENE.replace('"{{title}}"', JSON.stringify(title));
}

/** Starter Design JSX; the title is inserted as text, never as code. */
const DESIGN = `<Frame w={720} p={40} bg="#ffffff" flex="col" gap={12}>
  <Text size={13} weight={600} color="#2856c7">DESIGN</Text>
  <Text size={40} weight={700} color="#16181d">{{title}}</Text>
  <Text size={16} color="#5b6170">Edit the source, or ask the agent for a change.</Text>
  <Frame w={148} h={44} bg="#2856c7" rounded={10} flex="col" items="center" justify="center">
    <Text size={15} weight={600} color="#ffffff">Get started</Text>
  </Frame>
</Frame>
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_\[\]#]/g, (char) => `\\${char}`);
}

/**
 * Keep a title from opening a JSX expression or an element in the starter.
 * @param value the title.
 * @returns the text with syntax characters replaced.
 */
function escapeJsx(value: string): string {
  return value.replace(/[{}<>]/g, ' ');
}

/**
 * Starter content for a new artifact.
 * @param type the artifact type.
 * @param title the title, inserted as text.
 * @returns the content.
 */
export function starterContent(type: ArtifactType, title: string): string {
  if (type === 'doc') return DOC.replace('{{title}}', escapeMarkdown(title));
  if (type === 'design') return DESIGN.replace('{{title}}', escapeJsx(title));
  if (type === 'sheet') return sheetTemplate(title);
  if (type === 'board') return boardTemplate(title);
  return PAGE.replace('{{title}}', escapeHtml(title));
}
