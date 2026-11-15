#!/usr/bin/env node
/**
 * @b2apps/jsonld-seo-audit-mcp — Model Context Protocol (MCP) JSON-RPC 2.0 stdio server.
 * Handles initialize, notifications/initialized, ping, tools/list, and tools/call.
 * Educational & technical SEO/structured-data planning tool only; not financial, tax, or legal advice.
 */
import readline from "node:readline";
import {
  validateJsonLd,
  generateJsonLd,
  auditSeoMeta,
  batchAuditUrlsPro,
  SUPPORTED_SCHEMA_TYPES,
} from "./seo-engine.mjs";

export const SERVER_INFO = {
  name: "jsonld-seo-audit-mcp",
  version: "1.0.0",
};

export const TOOLS = [
  {
    name: "validate_jsonld",
    description:
      "Parse HTML (<script type=\"application/ld+json\">) or raw Schema.org JSON-LD, validate @context ('https://schema.org'), @type (Article, Product, FAQPage, Organization, SoftwareApplication, BreadcrumbList), required and recommended properties, and compute a 0-100 Google Rich Results readiness score.",
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description:
            "Raw JSON-LD string or full HTML document containing one or more <script type=\"application/ld+json\"> blocks.",
        },
      },
      required: ["input"],
    },
  },
  {
    name: "generate_jsonld",
    description:
      "Deterministically generate a valid Schema.org JSON-LD object and ready-to-embed <script type=\"application/ld+json\"> block from structured inputs, verified against Google Rich Results rules.",
    inputSchema: {
      type: "object",
      properties: {
        schemaType: {
          type: "string",
          enum: Object.keys(SUPPORTED_SCHEMA_TYPES),
          description:
            "Target Schema.org type: 'Article', 'Product', 'FAQPage', 'Organization', 'SoftwareApplication', or 'BreadcrumbList'.",
        },
        data: {
          type: "object",
          description:
            "Structured properties for the chosen Schema.org type (e.g. headline/author/datePublished for Article; name/price/priceCurrency for Product; questions:[{question,answer}] for FAQPage; items:[{name,url,position}] for BreadcrumbList).",
        },
      },
      required: ["schemaType", "data"],
    },
  },
  {
    name: "audit_seo_meta",
    description:
      "Audit an HTML document's technical SEO tags: <title> length, <meta name=\"description\">, <link rel=\"canonical\">, Open Graph (og:title, og:description, og:image, og:url, og:type), Twitter Card tags, <h1> count, <img> alt attribute coverage, and embedded JSON-LD validity.",
    inputSchema: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description: "Full HTML document string to audit.",
        },
        url: {
          type: "string",
          description: "Optional canonical/source URL of the page being audited.",
        },
      },
      required: ["html"],
    },
  },
  {
    name: "batch_audit_urls_pro",
    description:
      "Batch-audit multiple HTML/URL payloads for technical SEO & Schema.org JSON-LD compliance. Free tier audits up to 5 payloads per call; Pro tier ($19/mo via Gumroad/LemonSqueezy, MCP_PRO_LICENSE_KEY) unlocks unlimited batch auditing + JSON/CSV report generation.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "Page URL or identifier." },
              html: { type: "string", description: "HTML content for the page." },
            },
            required: ["html"],
          },
          description: "Array of { url, html } objects to audit.",
        },
        proLicenseKey: {
          type: "string",
          description: "Optional Pro license key (or set MCP_PRO_LICENSE_KEY in env).",
        },
        reportFormat: {
          type: "string",
          enum: ["json", "csv", "both"],
          description: "Report format preference when Pro is active (default: 'both').",
        },
      },
      required: ["items"],
    },
  },
];

export function handleJsonRpcRequest(msg) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id: msg?.id ?? null,
      error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" },
    };
  }

  // Notifications have no id and expect no response
  if (msg.id === undefined) {
    return null;
  }

  const { id, method, params = {} } = msg;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: params.protocolVersion || "2024-11-05",
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: SERVER_INFO,
          },
        };

      case "ping":
        return {
          jsonrpc: "2.0",
          id,
          result: {},
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS,
          },
        };

      case "tools/call": {
        const toolName = params?.name;
        const args = params?.arguments || {};
        let payload;

        switch (toolName) {
          case "validate_jsonld":
            if (!args.input || typeof args.input !== "string") {
              throw new Error("Missing required string argument 'input'.");
            }
            payload = validateJsonLd(args);
            break;

          case "generate_jsonld":
            payload = generateJsonLd(args);
            break;

          case "audit_seo_meta":
            payload = auditSeoMeta(args);
            break;

          case "batch_audit_urls_pro":
            payload = batchAuditUrlsPro(args);
            break;

          default:
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(payload, null, 2),
              },
            ],
            isError: false,
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: err instanceof Error ? err.message : String(err),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      },
    };
  }
}

// Start stdio listener when executed directly
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").slice(-2).join("/"));

if (isMain) {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }) + "\n"
      );
      return;
    }

    const res = handleJsonRpcRequest(parsed);
    if (res) {
      process.stdout.write(JSON.stringify(res) + "\n");
    }
  });
}
