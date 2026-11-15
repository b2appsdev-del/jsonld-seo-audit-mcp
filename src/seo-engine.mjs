/**
 * Deterministic Schema.org JSON-LD Validator, Generator & HTML Technical SEO Audit Engine.
 * Zero external network calls. Runs 100% locally in Node 18+.
 *
 * Disclaimer: Educational & technical compliance planning tool only; not financial, tax, or legal advice.
 */

export const SUPPORTED_SCHEMA_TYPES = {
  Article: {
    required: ["headline", "author", "datePublished"],
    recommended: ["image", "dateModified", "publisher", "description", "mainEntityOfPage"],
    nestedRules: (obj, errors, warnings) => {
      if (obj.headline && String(obj.headline).length > 110) {
        warnings.push("Article 'headline' exceeds Google Rich Results recommended 110-character limit.");
      }
      if (obj.author && typeof obj.author === "object" && !Array.isArray(obj.author)) {
        if (!obj.author.name) errors.push("Article 'author' object is missing required 'name' property.");
      }
      if (obj.datePublished && !/^\d{4}-\d{2}-\d{2}/.test(String(obj.datePublished))) {
        errors.push("Article 'datePublished' must be in ISO 8601 format (YYYY-MM-DD...).");
      }
    },
  },
  Product: {
    required: ["name", "offers"],
    recommended: ["image", "description", "sku", "brand", "aggregateRating", "review"],
    nestedRules: (obj, errors, warnings) => {
      if (obj.offers) {
        const offersList = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
        for (const [idx, offer] of offersList.entries()) {
          if (!offer || typeof offer !== "object") {
            errors.push(`Product 'offers[${idx}]' must be an Offer or AggregateOffer object.`);
            continue;
          }
          if (offer.price === undefined && offer.lowPrice === undefined) {
            errors.push(`Product 'offers[${idx}]' is missing required 'price' (or 'lowPrice').`);
          }
          if (!offer.priceCurrency || !/^[A-Z]{3}$/.test(String(offer.priceCurrency))) {
            errors.push(`Product 'offers[${idx}]' is missing valid 3-letter ISO 'priceCurrency' (e.g. 'EUR', 'USD').`);
          }
          if (!offer.availability) {
            warnings.push(`Product 'offers[${idx}]' is missing recommended 'availability' (e.g. 'https://schema.org/InStock').`);
          }
        }
      }
    },
  },
  FAQPage: {
    required: ["mainEntity"],
    recommended: ["name", "description"],
    nestedRules: (obj, errors) => {
      if (!Array.isArray(obj.mainEntity) || obj.mainEntity.length === 0) {
        errors.push("FAQPage 'mainEntity' must be a non-empty array of Question objects.");
        return;
      }
      for (const [idx, q] of obj.mainEntity.entries()) {
        if (!q || q["@type"] !== "Question") {
          errors.push(`FAQPage 'mainEntity[${idx}]' must have '@type': 'Question'.`);
        }
        if (!q?.name) {
          errors.push(`FAQPage 'mainEntity[${idx}]' Question is missing required 'name' (question text).`);
        }
        const ans = q?.acceptedAnswer;
        if (!ans || ans["@type"] !== "Answer" || !ans.text) {
          errors.push(`FAQPage 'mainEntity[${idx}]' is missing valid 'acceptedAnswer' with '@type': 'Answer' and 'text'.`);
        }
      }
    },
  },
  Organization: {
    required: ["name", "url"],
    recommended: ["logo", "sameAs", "contactPoint", "description"],
    nestedRules: (obj, errors, warnings) => {
      if (obj.url && !/^https?:\/\//i.test(String(obj.url))) {
        errors.push("Organization 'url' must be an absolute HTTP/HTTPS URL.");
      }
      if (obj.sameAs && !Array.isArray(obj.sameAs)) {
        warnings.push("Organization 'sameAs' should be an array of profile URLs.");
      }
    },
  },
  SoftwareApplication: {
    required: ["name", "operatingSystem", "applicationCategory", "offers"],
    recommended: ["aggregateRating", "softwareVersion", "description", "screenshot"],
    nestedRules: (obj, errors) => {
      if (obj.offers && typeof obj.offers === "object") {
        const offer = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
        if (offer && (offer.price === undefined || !offer.priceCurrency)) {
          errors.push("SoftwareApplication 'offers' must include both 'price' and 'priceCurrency'.");
        }
      }
    },
  },
  BreadcrumbList: {
    required: ["itemListElement"],
    recommended: ["name"],
    nestedRules: (obj, errors) => {
      if (!Array.isArray(obj.itemListElement) || obj.itemListElement.length === 0) {
        errors.push("BreadcrumbList 'itemListElement' must be a non-empty array of ListItem objects.");
        return;
      }
      for (const [idx, item] of obj.itemListElement.entries()) {
        if (!item || item["@type"] !== "ListItem") {
          errors.push(`BreadcrumbList 'itemListElement[${idx}]' must have '@type': 'ListItem'.`);
        }
        if (typeof item?.position !== "number" || item.position < 1) {
          errors.push(`BreadcrumbList 'itemListElement[${idx}]' must have a positive integer 'position'.`);
        }
        if (!item?.name) {
          errors.push(`BreadcrumbList 'itemListElement[${idx}]' is missing required 'name'.`);
        }
      }
    },
  },
};

const DISCLAIMER =
  "Educational & technical SEO/structured-data planning tool only; not financial, tax, or legal advice.";

/**
 * Extracts JSON-LD strings from HTML or treats input as raw JSON-LD.
 */
function extractJsonLdBlocks(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let match;
  while ((match = scriptRegex.exec(raw)) !== null) {
    if (match[1] && match[1].trim()) {
      blocks.push(match[1].trim());
    }
  }

  if (blocks.length > 0) return blocks;
  // If no <script> tags found, check if it looks like JSON
  if (raw.startsWith("{") || raw.startsWith("[")) {
    return [raw];
  }
  return [];
}

/**
 * Tool 1: validate_jsonld
 * Parses HTML or raw JSON-LD, validates @context (https://schema.org), @type,
 * required/recommended properties, and returns Google Rich Results readiness score.
 */
export function validateJsonLd(params = {}) {
  const input = params.input ?? params.html ?? params.jsonld ?? "";
  const rawBlocks = extractJsonLdBlocks(input);

  if (rawBlocks.length === 0) {
    return {
      valid: false,
      blockCount: 0,
      richResultsReady: false,
      readinessScore: 0,
      entities: [],
      errors: ["No JSON-LD payload or <script type=\"application/ld+json\"> block found in input."],
      warnings: [],
      disclaimer: DISCLAIMER,
    };
  }

  const entities = [];
  const allErrors = [];
  const allWarnings = [];

  for (const [blockIdx, blockText] of rawBlocks.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(blockText);
    } catch (err) {
      allErrors.push(`Block #${blockIdx + 1}: Invalid JSON syntax (${err.message}).`);
      continue;
    }

    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.["@graph"])
      ? parsed["@graph"].map((node) => ({
          "@context": node["@context"] || parsed["@context"],
          ...node,
        }))
      : [parsed];

    for (const [itemIdx, item] of items.entries()) {
      const label = `Block #${blockIdx + 1}${items.length > 1 ? ` (Entity #${itemIdx + 1})` : ""}`;
      const errors = [];
      const warnings = [];

      if (!item || typeof item !== "object") {
        errors.push(`${label}: JSON-LD entity must be a JSON object.`);
        allErrors.push(...errors);
        continue;
      }

      const ctx = item["@context"];
      const validContext =
        typeof ctx === "string" && /^https?:\/\/schema\.org\/?$/i.test(ctx.trim());
      if (!validContext) {
        errors.push(`${label}: '@context' must be 'https://schema.org' (found: ${JSON.stringify(ctx ?? null)}).`);
      } else if (ctx.trim().startsWith("http://")) {
        warnings.push(`${label}: '@context' uses 'http://schema.org'; prefer 'https://schema.org'.`);
      }

      const rawType = item["@type"];
      const schemaType = Array.isArray(rawType) ? rawType[0] : rawType;
      if (!schemaType || typeof schemaType !== "string") {
        errors.push(`${label}: Missing required string '@type' property.`);
      }

      const spec = schemaType ? SUPPORTED_SCHEMA_TYPES[schemaType] : null;
      const missingRequired = [];
      const missingRecommended = [];

      if (schemaType && !spec) {
        warnings.push(
          `${label}: '@type' '${schemaType}' is not in the primary Rich Results rule set (${Object.keys(
            SUPPORTED_SCHEMA_TYPES
          ).join(", ")}); basic Schema.org syntax checked.`
        );
      } else if (spec) {
        for (const reqProp of spec.required) {
          const val = item[reqProp];
          if (val === undefined || val === null || val === "") {
            missingRequired.push(reqProp);
            errors.push(`${label} (${schemaType}): Missing required property '${reqProp}'.`);
          }
        }
        for (const recProp of spec.recommended) {
          const val = item[recProp];
          if (val === undefined || val === null || val === "") {
            missingRecommended.push(recProp);
            warnings.push(`${label} (${schemaType}): Missing recommended property '${recProp}'.`);
          }
        }
        if (spec.nestedRules) {
          spec.nestedRules(item, errors, warnings);
        }
      }

      let entityScore = 100;
      entityScore -= errors.length * 25;
      entityScore -= warnings.length * 5;
      entityScore = Math.max(0, Math.min(100, entityScore));

      entities.push({
        type: schemaType || "Unknown",
        validContext,
        missingRequired,
        missingRecommended,
        errors,
        warnings,
        entityScore,
        richResultsEligible: errors.length === 0 && Boolean(spec),
      });

      allErrors.push(...errors);
      allWarnings.push(...warnings);
    }
  }

  const avgScore =
    entities.length > 0
      ? Math.round(entities.reduce((acc, e) => acc + e.entityScore, 0) / entities.length)
      : 0;

  return {
    valid: allErrors.length === 0 && entities.length > 0,
    blockCount: rawBlocks.length,
    entityCount: entities.length,
    richResultsReady: allErrors.length === 0 && entities.some((e) => e.richResultsEligible),
    readinessScore: allErrors.length === 0 ? avgScore : Math.min(avgScore, 65),
    entities,
    errors: allErrors,
    warnings: allWarnings,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Tool 2: generate_jsonld
 * Deterministically generates valid Schema.org JSON-LD <script type="application/ld+json"> blocks from structured inputs.
 */
export function generateJsonLd(params = {}) {
  const { schemaType, data = {} } = params;
  if (!schemaType || !SUPPORTED_SCHEMA_TYPES[schemaType]) {
    throw new Error(
      `Unsupported or missing 'schemaType'. Must be one of: ${Object.keys(SUPPORTED_SCHEMA_TYPES).join(", ")}.`
    );
  }
  if (!data || typeof data !== "object") {
    throw new Error("Missing or invalid 'data' object for generate_jsonld.");
  }

  let payload = {
    "@context": "https://schema.org",
    "@type": schemaType,
  };

  switch (schemaType) {
    case "Article": {
      payload = {
        ...payload,
        headline: data.headline,
        description: data.description,
        image: data.image ? (Array.isArray(data.image) ? data.image : [data.image]) : undefined,
        datePublished: data.datePublished,
        dateModified: data.dateModified || data.datePublished,
        author:
          typeof data.author === "string"
            ? { "@type": "Person", name: data.author, ...(data.authorUrl ? { url: data.authorUrl } : {}) }
            : data.author,
        publisher:
          typeof data.publisher === "string"
            ? {
                "@type": "Organization",
                name: data.publisher,
                ...(data.publisherLogo
                  ? { logo: { "@type": "ImageObject", url: data.publisherLogo } }
                  : {}),
              }
            : data.publisher,
        mainEntityOfPage: data.url
          ? { "@type": "WebPage", "@id": data.url }
          : data.mainEntityOfPage,
      };
      break;
    }

    case "Product": {
      const offers = data.offers || {
        "@type": "Offer",
        price: data.price,
        priceCurrency: data.priceCurrency || "EUR",
        availability: data.availability || "https://schema.org/InStock",
        ...(data.url ? { url: data.url } : {}),
      };
      if (offers && !Array.isArray(offers) && !offers["@type"]) {
        offers["@type"] = "Offer";
      }
      payload = {
        ...payload,
        name: data.name,
        description: data.description,
        sku: data.sku,
        image: data.image ? (Array.isArray(data.image) ? data.image : [data.image]) : undefined,
        brand:
          typeof data.brand === "string"
            ? { "@type": "Brand", name: data.brand }
            : data.brand,
        offers,
        ...(data.ratingValue
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: data.ratingValue,
                reviewCount: data.reviewCount || 1,
              },
            }
          : data.aggregateRating
          ? { aggregateRating: data.aggregateRating }
          : {}),
      };
      break;
    }

    case "FAQPage": {
      const questions = Array.isArray(data.questions)
        ? data.questions.map((q) => ({
            "@type": "Question",
            name: q.question || q.name,
            acceptedAnswer: {
              "@type": "Answer",
              text: q.answer || q.text || q.acceptedAnswer?.text,
            },
          }))
        : data.mainEntity;
      payload = {
        ...payload,
        ...(data.name ? { name: data.name } : {}),
        ...(data.description ? { description: data.description } : {}),
        mainEntity: questions,
      };
      break;
    }

    case "Organization": {
      payload = {
        ...payload,
        name: data.name,
        url: data.url,
        logo: data.logo,
        description: data.description,
        sameAs: Array.isArray(data.sameAs) ? data.sameAs : data.sameAs ? [data.sameAs] : undefined,
        contactPoint: data.contactPoint,
      };
      break;
    }

    case "SoftwareApplication": {
      const offers = data.offers || {
        "@type": "Offer",
        price: data.price !== undefined ? data.price : "0",
        priceCurrency: data.priceCurrency || "USD",
      };
      if (offers && !offers["@type"]) offers["@type"] = "Offer";
      payload = {
        ...payload,
        name: data.name,
        operatingSystem: data.operatingSystem || "Web, Windows, macOS, Linux",
        applicationCategory: data.applicationCategory || "DeveloperApplication",
        description: data.description,
        softwareVersion: data.softwareVersion,
        offers,
        ...(data.aggregateRating ? { aggregateRating: data.aggregateRating } : {}),
      };
      break;
    }

    case "BreadcrumbList": {
      const items = Array.isArray(data.items)
        ? data.items.map((it, idx) => ({
            "@type": "ListItem",
            position: it.position || idx + 1,
            name: it.name,
            ...(it.url || it.item ? { item: it.url || it.item } : {}),
          }))
        : data.itemListElement;
      payload = {
        ...payload,
        ...(data.name ? { name: data.name } : {}),
        itemListElement: items,
      };
      break;
    }
  }

  // Strip undefined properties cleanly
  const cleanPayload = JSON.parse(JSON.stringify(payload));
  const jsonString = JSON.stringify(cleanPayload, null, 2);
  const scriptTag = `<script type="application/ld+json">\n${jsonString}\n</script>`;
  const validation = validateJsonLd({ input: jsonString });

  return {
    schemaType,
    jsonLd: cleanPayload,
    scriptTag,
    validation: {
      valid: validation.valid,
      richResultsReady: validation.richResultsReady,
      readinessScore: validation.readinessScore,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    disclaimer: DISCLAIMER,
  };
}

/**
 * Helper to extract an attribute from a tag string.
 */
function getAttr(tag, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, "i");
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
}

/**
 * Tool 3: audit_seo_meta
 * Audits HTML <title>, <meta name="description">, canonical URL, Open Graph tags, and <img> alt attributes.
 */
export function auditSeoMeta(params = {}) {
  const html = String(params.html || "");
  const pageUrl = params.url ? String(params.url).trim() : null;

  if (!html.trim()) {
    throw new Error("Missing required non-empty 'html' string for audit_seo_meta.");
  }

  const issues = [];
  const warnings = [];
  const passedChecks = [];

  // 1. <title>
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : null;
  const titleLength = title ? title.length : 0;

  if (!title) {
    issues.push("Missing <title> tag.");
  } else if (titleLength < 30) {
    warnings.push(`<title> is too short (${titleLength} chars; recommended 30–60 chars).`);
  } else if (titleLength > 60) {
    warnings.push(`<title> exceeds 60 characters (${titleLength} chars; may truncate in SERPs).`);
  } else {
    passedChecks.push(`<title> length optimal (${titleLength} chars).`);
  }

  // 2. Meta tags (<meta ...>)
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  let metaDescription = null;
  let metaRobots = null;
  let metaViewport = null;
  const openGraph = {};
  const twitterCard = {};

  for (const tag of metaTags) {
    const nameAttr = (getAttr(tag, "name") || "").toLowerCase();
    const propAttr = (getAttr(tag, "property") || "").toLowerCase();
    const content = getAttr(tag, "content") ?? "";

    if (nameAttr === "description") metaDescription = content;
    if (nameAttr === "robots") metaRobots = content;
    if (nameAttr === "viewport") metaViewport = content;
    if (nameAttr.startsWith("twitter:")) twitterCard[nameAttr] = content;
    if (propAttr.startsWith("og:")) openGraph[propAttr] = content;
    else if (nameAttr.startsWith("og:")) openGraph[nameAttr] = content;
  }

  const descriptionLength = metaDescription ? metaDescription.length : 0;
  if (!metaDescription) {
    issues.push("Missing <meta name=\"description\"> tag.");
  } else if (descriptionLength < 70) {
    warnings.push(`Meta description is short (${descriptionLength} chars; recommended 70–160 chars).`);
  } else if (descriptionLength > 160) {
    warnings.push(`Meta description exceeds 160 characters (${descriptionLength} chars; may truncate in SERPs).`);
  } else {
    passedChecks.push(`Meta description length optimal (${descriptionLength} chars).`);
  }

  if (!metaViewport) {
    warnings.push("Missing <meta name=\"viewport\"> tag for mobile responsiveness.");
  } else {
    passedChecks.push("Mobile <meta name=\"viewport\"> present.");
  }

  // 3. Canonical link
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  let canonicalUrl = null;
  for (const tag of linkTags) {
    const rel = (getAttr(tag, "rel") || "").toLowerCase();
    if (rel.split(/\s+/).includes("canonical")) {
      canonicalUrl = getAttr(tag, "href");
      break;
    }
  }

  if (!canonicalUrl) {
    issues.push("Missing <link rel=\"canonical\" href=\"...\"> tag.");
  } else if (!/^https?:\/\//i.test(canonicalUrl)) {
    warnings.push(`Canonical URL '${canonicalUrl}' should be an absolute HTTPS/HTTP URL.`);
  } else {
    passedChecks.push("Valid absolute canonical URL present.");
  }

  // 4. Open Graph tags
  const requiredOg = ["og:title", "og:description", "og:image", "og:url", "og:type"];
  const missingOg = requiredOg.filter((k) => !openGraph[k]);
  if (missingOg.length > 0) {
    warnings.push(`Missing Open Graph tags: ${missingOg.join(", ")}.`);
  } else {
    passedChecks.push("All core Open Graph tags (og:title, og:description, og:image, og:url, og:type) present.");
  }

  // 5. Headings (<h1>)
  const h1Matches = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Count = h1Matches.length;
  if (h1Count === 0) {
    issues.push("Missing <h1> heading tag on page.");
  } else if (h1Count > 1) {
    warnings.push(`Multiple <h1> tags detected (${h1Count} found; prefer a single primary <h1>).`);
  } else {
    passedChecks.push("Single primary <h1> heading present.");
  }

  // 6. <img> alt attribute coverage
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  let imagesMissingAlt = 0;
  let imagesEmptyAlt = 0;
  for (const img of imgTags) {
    const alt = getAttr(img, "alt");
    if (alt === null) {
      imagesMissingAlt++;
    } else if (alt.length === 0) {
      imagesEmptyAlt++;
    }
  }

  if (imagesMissingAlt > 0) {
    issues.push(`${imagesMissingAlt} of ${imgTags.length} <img> tag(s) are missing an 'alt' attribute.`);
  } else if (imgTags.length > 0) {
    passedChecks.push(`All ${imgTags.length} <img> tag(s) include 'alt' attributes.`);
  }

  // 7. Embedded JSON-LD check
  const jsonLdBlocks = extractJsonLdBlocks(html);
  const jsonLdAudit = jsonLdBlocks.length > 0 ? validateJsonLd({ input: html }) : null;
  if (!jsonLdAudit) {
    warnings.push("No Schema.org <script type=\"application/ld+json\"> structured data found in HTML.");
  } else if (!jsonLdAudit.valid) {
    issues.push(`Embedded JSON-LD has ${jsonLdAudit.errors.length} validation error(s).`);
  } else {
    passedChecks.push(`Embedded Schema.org JSON-LD validated (${jsonLdAudit.entityCount} entity/entities).`);
  }

  let seoScore = 100;
  seoScore -= issues.length * 18;
  seoScore -= warnings.length * 6;
  seoScore = Math.max(0, Math.min(100, seoScore));

  return {
    url: pageUrl,
    seoScore,
    grade: seoScore >= 90 ? "A" : seoScore >= 75 ? "B" : seoScore >= 60 ? "C" : "D",
    compliant: issues.length === 0,
    meta: {
      title,
      titleLength,
      description: metaDescription,
      descriptionLength,
      canonicalUrl,
      robots: metaRobots,
      viewport: metaViewport,
      h1Count,
      openGraph,
      twitterCard,
    },
    images: {
      totalImages: imgTags.length,
      withAlt: imgTags.length - imagesMissingAlt,
      missingAlt: imagesMissingAlt,
      decorativeEmptyAlt: imagesEmptyAlt,
    },
    structuredData: {
      present: Boolean(jsonLdAudit),
      valid: jsonLdAudit ? jsonLdAudit.valid : false,
      readinessScore: jsonLdAudit ? jsonLdAudit.readinessScore : 0,
      entityTypes: jsonLdAudit ? jsonLdAudit.entities.map((e) => e.type) : [],
    },
    issueCount: issues.length,
    warningCount: warnings.length,
    issues,
    warnings,
    passedChecks,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Tool 4: batch_audit_urls_pro
 * Audits up to 5 HTML/URL payloads on Free tier; unlocks unlimited batch auditing +
 * JSON/CSV report generation with a Pro license key ($19/mo via Gumroad/LemonSqueezy).
 */
export function batchAuditUrlsPro(params = {}) {
  const { items = [], proLicenseKey = "", reportFormat = "both" } = params;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("batch_audit_urls_pro requires a non-empty 'items' array of { url, html } objects.");
  }

  const effectiveKey = String(proLicenseKey || process.env.MCP_PRO_LICENSE_KEY || "").trim();
  const hasPro = /^PRO-[A-Z0-9-]{8,}$/i.test(effectiveKey);
  const FREE_LIMIT = 5;

  const truncated = !hasPro && items.length > FREE_LIMIT;
  const slice = truncated ? items.slice(0, FREE_LIMIT) : items;

  const results = slice.map((entry, idx) => {
    const itemObj = typeof entry === "string" ? { url: `page-${idx + 1}`, html: entry } : entry || {};
    const url = itemObj.url || `page-${idx + 1}`;
    const html = itemObj.html || "";
    const metaAudit = auditSeoMeta({ url, html });
    return {
      url,
      seoScore: metaAudit.seoScore,
      grade: metaAudit.grade,
      compliant: metaAudit.compliant,
      title: metaAudit.meta.title,
      canonicalUrl: metaAudit.meta.canonicalUrl,
      missingAltCount: metaAudit.images.missingAlt,
      jsonLdValid: metaAudit.structuredData.valid,
      jsonLdTypes: metaAudit.structuredData.entityTypes,
      issueCount: metaAudit.issueCount,
      warningCount: metaAudit.warningCount,
      issues: metaAudit.issues,
    };
  });

  const averageSeoScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.seoScore, 0) / results.length)
      : 0;

  let csvReport = null;
  if (hasPro && (reportFormat === "csv" || reportFormat === "both")) {
    const header = "url,seoScore,grade,compliant,jsonLdValid,missingAltCount,issueCount,warningCount";
    const rows = results.map((r) =>
      [
        `"${String(r.url).replace(/"/g, '""')}"`,
        r.seoScore,
        r.grade,
        r.compliant,
        r.jsonLdValid,
        r.missingAltCount,
        r.issueCount,
        r.warningCount,
      ].join(",")
    );
    csvReport = [header, ...rows].join("\n");
  }

  return {
    totalRequested: items.length,
    processedCount: results.length,
    averageSeoScore,
    compliantCount: results.filter((r) => r.compliant).length,
    nonCompliantCount: results.filter((r) => !r.compliant).length,
    proActive: hasPro,
    proRequired: truncated,
    upgradeNotice: truncated
      ? `Free local tier audits up to ${FREE_LIMIT} HTML/URL payloads per batch call (${
          items.length - FREE_LIMIT
        } omitted). Unlock unlimited batch auditing + automated CSV/JSON reports with a Pro license key ($19/mo): https://b2apps.lemonsqueezy.com/buy/jsonld-seo-audit-mcp-pro`
      : null,
    results,
    csvReport,
    disclaimer: DISCLAIMER,
  };
}
