figma.showUI(__html__, {
  width: 420,
  height: 720,
});

const DEFAULT_TEXT_STYLE_SPECS = [
  {
    name: "typography/h1",
    fontFamily: "Nunito",
    fontStyle: "Bold",
    fontSize: 40,
    lineHeight: 60,
  },
  {
    name: "typography/h2",
    fontFamily: "Nunito",
    fontStyle: "Bold",
    fontSize: 24,
    lineHeight: 36,
  },
  {
    name: "typography/h3",
    fontFamily: "Nunito",
    fontStyle: "Bold",
    fontSize: 18,
    lineHeight: 28,
  },
  {
    name: "typography/body",
    fontFamily: "Nunito",
    fontStyle: "Regular",
    fontSize: 15,
    lineHeight: 24,
  },
  {
    name: "typography/label",
    fontFamily: "Nunito",
    fontStyle: "Medium",
    fontSize: 13,
    lineHeight: 20,
  },
  {
    name: "typography/caption",
    fontFamily: "Nunito",
    fontStyle: "Light",
    fontSize: 12,
    lineHeight: 18,
  },
  {
    name: "typography/overline",
    fontFamily: "Nunito",
    fontStyle: "Medium",
    fontSize: 12,
    lineHeight: 16,
    textCase: "UPPER",
    letterSpacing: 8,
  },
  {
    name: "typography/code",
    fontFamily: "Roboto Mono",
    fontStyle: "Regular",
    fontSize: 13,
    lineHeight: 20,
  },
];

function postStatus(message, isError) {
  figma.ui.postMessage({
    type: "status",
    message: String(message || ""),
    isError: Boolean(isError),
  });
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function getByPath(root, path) {
  return String(path)
    .split(".")
    .reduce((current, part) => (current == null ? undefined : current[part]), root);
}

function resolveTokenValue(value, rootTokens, seen) {
  if (seen === undefined) {
    seen = new Set();
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^\{(.+)\}$/);
  if (!match) {
    return value;
  }

  const referencePath = match[1];
  if (seen.has(referencePath)) {
    throw new Error(`Circular token reference detected for "${referencePath}".`);
  }

  const nextSeen = new Set(seen);
  nextSeen.add(referencePath);

  const resolved = getByPath(rootTokens, referencePath);
  if (typeof resolved === "undefined") {
    throw new Error(`Could not resolve token reference "${referencePath}".`);
  }

  return resolveTokenValue(resolved, rootTokens, nextSeen);
}

function parseHexColorToRgba(hex) {
  if (typeof hex !== "string") {
    throw new Error(`Expected a hex color string, received ${typeof hex}.`);
  }

  let normalized = hex.trim().replace("#", "");

  if (normalized.length === 3 || normalized.length === 4) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (normalized.length !== 6 && normalized.length !== 8) {
    throw new Error(`Unsupported hex color "${hex}".`);
  }

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid hex color "${hex}".`);
  }

  const bigint = parseInt(normalized, 16);
  const hasAlpha = normalized.length === 8;

  const r = hasAlpha ? (bigint >> 24) & 255 : (bigint >> 16) & 255;
  const g = hasAlpha ? (bigint >> 16) & 255 : (bigint >> 8) & 255;
  const b = hasAlpha ? (bigint >> 8) & 255 : bigint & 255;
  const a = hasAlpha ? (bigint & 255) / 255 : 1;

  return { r: r / 255, g: g / 255, b: b / 255, a };
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const num = parseFloat(value.replace(/px$/i, "").trim());
    if (Number.isFinite(num)) {
      return num;
    }
  }

  throw new Error(`Expected a numeric token value, received "${value}".`);
}

async function importTokensAsVariables(tokens) {
  const primitives = tokens && tokens.primitives;

  if (!primitives || typeof primitives !== "object") {
    throw new Error("Missing tokens.primitives in the imported payload.");
  }

  if (!figma.variables || !figma.variables.createVariableCollection) {
    throw new Error("This Figma file does not support Variables.");
  }

  const localCollections = figma.variables.getLocalVariableCollectionsAsync
    ? await figma.variables.getLocalVariableCollectionsAsync()
    : figma.variables.getLocalVariableCollections();
  const existingCollection = localCollections.find((item) => item.name === "Primitives");
  const collection = existingCollection || figma.variables.createVariableCollection("Primitives");
  const modeId = collection.modes[0] && collection.modes[0].modeId;

  if (!modeId) {
    throw new Error('The "Primitives" collection does not have an available mode.');
  }

  const localVariables = figma.variables.getLocalVariablesAsync
    ? await figma.variables.getLocalVariablesAsync()
    : figma.variables.getLocalVariables();

  let createdCount = 0;
  let writtenCount = 0;

  function toVariableName(path) {
    return String(path)
      .split(".")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join("/");
  }

  function getOrCreateVariable(name, resolvedType) {
    const variableName = toVariableName(name);
    const existingVariable = localVariables.find(
      (item) => item.variableCollectionId === collection.id && item.name === variableName
    );

    if (existingVariable) {
      if (existingVariable.resolvedType !== resolvedType) {
        throw new Error(
          `Variable "${variableName}" already exists as ${existingVariable.resolvedType}, expected ${resolvedType}.`
        );
      }

      return existingVariable;
    }

    const createdVariable = figma.variables.createVariable(variableName, collection, resolvedType);
    localVariables.push(createdVariable);
    createdCount += 1;
    return createdVariable;
  }

  function setVar(variable, value) {
    variable.setValueForMode(modeId, value);
    writtenCount += 1;
  }

  function createColor(name, value) {
    const variable = getOrCreateVariable(name, "COLOR");
    const rgba = parseHexColorToRgba(value);
    setVar(variable, rgba);
  }

  function createFloat(name, value) {
    const variable = getOrCreateVariable(name, "FLOAT");
    setVar(variable, parseNumber(value));
  }

  function createString(name, value) {
    const variable = getOrCreateVariable(name, "STRING");
    setVar(variable, String(value));
  }

  function importNestedGroup(groupName, group, createValue) {
    if (!isPlainObject(group)) {
      return;
    }

    for (const key in group) {
      if (!Object.prototype.hasOwnProperty.call(group, key)) {
        continue;
      }

      const value = group[key];

      if (isPlainObject(value)) {
        importNestedGroup(`${groupName}.${key}`, value, createValue);
      } else {
        createValue(`${groupName}.${key}`, value);
      }
    }
  }

  function importResolvedGroup(groupName, group, createValue, rootTokens) {
    if (!isPlainObject(group)) {
      return;
    }

    for (const key in group) {
      if (!Object.prototype.hasOwnProperty.call(group, key)) {
        continue;
      }

      const value = group[key];

      if (isPlainObject(value)) {
        importResolvedGroup(`${groupName}.${key}`, value, createValue, rootTokens);
      } else {
        const resolvedValue = resolveTokenValue(value, rootTokens, new Set());
        createValue(`${groupName}.${key}`, resolvedValue);
      }
    }
  }

  importNestedGroup("color", primitives.color, createColor);
  importNestedGroup("spacing", primitives.spacing, createFloat);
  importNestedGroup("radius", primitives.radius, createFloat);
  importNestedGroup("shadow", primitives.shadow, createString);

  if (isPlainObject(tokens.semantic)) {
    importResolvedGroup("semantic.color", tokens.semantic.color, createColor, tokens);
    importResolvedGroup("semantic.spacing", tokens.semantic.spacing, createFloat, tokens);
    importResolvedGroup("semantic.radius", tokens.semantic.radius, createFloat, tokens);
    importResolvedGroup("semantic.shadow", tokens.semantic.shadow, createString, tokens);
  }

  return { createdCount, writtenCount };
}

function collectLeafTokens(node, path, results) {
  if (path === undefined) {
    path = [];
  }

  if (results === undefined) {
    results = [];
  }

  if (!isPlainObject(node)) {
    results.push({
      name: path.join("/"),
      path: path.slice(),
      value: node,
    });
    return results;
  }

  for (const key in node) {
    if (!Object.prototype.hasOwnProperty.call(node, key)) {
      continue;
    }

    const nextPath = path.slice();
    nextPath.push(key);
    collectLeafTokens(node[key], nextPath, results);
  }

  return results;
}

function parseRgbaColor(input) {
  const rgbaMatch = String(input).match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );

  if (!rgbaMatch) {
    throw new Error("Unsupported rgba color: " + input);
  }

  return {
    r: Number(rgbaMatch[1]) / 255,
    g: Number(rgbaMatch[2]) / 255,
    b: Number(rgbaMatch[3]) / 255,
    a: rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]),
  };
}

function parseShadow(value) {
  const match = String(value).match(
    /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+(rgba?\([^)]+\))$/i
  );

  if (!match) {
    throw new Error("Unsupported shadow format: " + value);
  }

  return {
    type: "DROP_SHADOW",
    color: parseRgbaColor(match[5]),
    offset: {
      x: Number(match[1]),
      y: Number(match[2]),
    },
    radius: Number(match[3]),
    spread: match[4] === undefined ? 0 : Number(match[4]),
    visible: true,
    blendMode: "NORMAL",
  };
}

function findStyleByName(styles, name) {
  for (let i = 0; i < styles.length; i += 1) {
    if (styles[i].name === name) {
      return styles[i];
    }
  }
  return null;
}

function upsertPaintStyle(paintStyles, name, hexColor) {
  const existing = findStyleByName(paintStyles, name);
  const style = existing || figma.createPaintStyle();
  const rgba = parseHexColorToRgba(hexColor);

  if (!existing) {
    paintStyles.push(style);
  }

  style.name = name;
  style.paints = [
    {
      type: "SOLID",
      color: { r: rgba.r, g: rgba.g, b: rgba.b },
      opacity: rgba.a,
    },
  ];

  return style;
}

function upsertEffectStyle(effectStyles, name, shadowValue) {
  const existing = findStyleByName(effectStyles, name);
  const style = existing || figma.createEffectStyle();

  if (!existing) {
    effectStyles.push(style);
  }

  style.name = name;
  style.effects = [parseShadow(shadowValue)];

  return style;
}

function upsertTextStyle(textStyles, spec) {
  const existing = findStyleByName(textStyles, spec.name);
  const style = existing || figma.createTextStyle();

  if (!existing) {
    textStyles.push(style);
  }

  style.name = spec.name;
  style.fontName = {
    family: spec.fontFamily,
    style: spec.fontStyle,
  };
  style.fontSize = spec.fontSize;
  style.lineHeight = {
    unit: "PIXELS",
    value: spec.lineHeight,
  };

  if (spec.letterSpacing !== undefined) {
    style.letterSpacing = {
      unit: "PERCENT",
      value: spec.letterSpacing,
    };
  }

  if (spec.textCase) {
    style.textCase = spec.textCase;
  }

  return style;
}

function isHexColor(value) {
  return (
    typeof value === "string" &&
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
  );
}

function isShadowValue(value) {
  return (
    typeof value === "string" &&
    /^-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px)?\s+rgba?\([^)]+\)$/i.test(
      value
    )
  );
}

function pathContains(path, part) {
  for (let i = 0; i < path.length; i += 1) {
    if (String(path[i]).toLowerCase() === part) {
      return true;
    }
  }
  return false;
}

function deriveStyleBuckets(tokens) {
  const leaves = collectLeafTokens(tokens);
  const paintTokens = [];
  const effectTokens = [];
  const warnings = [];

  for (let i = 0; i < leaves.length; i += 1) {
    const leaf = leaves[i];
    let resolvedValue;

    try {
      resolvedValue = resolveTokenValue(leaf.value, tokens);
    } catch (error) {
      warnings.push(String(error instanceof Error ? error.message : error));
      continue;
    }

    const lowerPath = leaf.path.join("/").toLowerCase();
    const suggestedKind =
      pathContains(leaf.path, "shadow") || pathContains(leaf.path, "elevation")
        ? "effect"
        : pathContains(leaf.path, "color") ||
          pathContains(leaf.path, "background") ||
          pathContains(leaf.path, "bg")
        ? "paint"
        : "";

    if (isHexColor(resolvedValue)) {
      paintTokens.push({ name: leaf.name, value: resolvedValue });
      continue;
    }

    if (isShadowValue(resolvedValue)) {
      effectTokens.push({ name: leaf.name, value: resolvedValue });
      continue;
    }

    if (suggestedKind === "paint" || suggestedKind === "effect") {
      warnings.push("Skipped unsupported " + suggestedKind + " token: " + lowerPath);
    }
  }

  return { paintTokens, effectTokens, warnings };
}

function getTextStyleSpecs(tokens) {
  if (tokens && Array.isArray(tokens.textStyles) && tokens.textStyles.length > 0) {
    return tokens.textStyles;
  }

  return DEFAULT_TEXT_STYLE_SPECS;
}

async function generateStylesFromTokens(tokens, options) {
  const paintStyles = figma.getLocalPaintStylesAsync
    ? await figma.getLocalPaintStylesAsync()
    : figma.getLocalPaintStyles();
  const effectStyles = figma.getLocalEffectStylesAsync
    ? await figma.getLocalEffectStylesAsync()
    : figma.getLocalEffectStyles();
  const textStyles = figma.getLocalTextStylesAsync
    ? await figma.getLocalTextStylesAsync()
    : figma.getLocalTextStyles();

  const createdOrUpdatedPaintStyles = [];
  const createdOrUpdatedEffectStyles = [];
  const createdOrUpdatedTextStyles = [];
  let warnings = [];

  const buckets = deriveStyleBuckets(tokens);
  warnings = warnings.concat(buckets.warnings);

  for (let i = 0; i < buckets.paintTokens.length; i += 1) {
    try {
      upsertPaintStyle(paintStyles, buckets.paintTokens[i].name, buckets.paintTokens[i].value);
      createdOrUpdatedPaintStyles.push(buckets.paintTokens[i].name);
    } catch (error) {
      warnings.push(String(error instanceof Error ? error.message : error));
    }
  }

  for (let i = 0; i < buckets.effectTokens.length; i += 1) {
    try {
      upsertEffectStyle(effectStyles, buckets.effectTokens[i].name, buckets.effectTokens[i].value);
      createdOrUpdatedEffectStyles.push(buckets.effectTokens[i].name);
    } catch (error) {
      warnings.push(String(error instanceof Error ? error.message : error));
    }
  }

  if (options && options.includeTextStyles === false) {
    return {
      paintCount: createdOrUpdatedPaintStyles.length,
      effectCount: createdOrUpdatedEffectStyles.length,
      textCount: 0,
      warnings,
    };
  }

  const textStyleSpecs = getTextStyleSpecs(tokens);
  const loadableTextStyleSpecs = [];

  for (let i = 0; i < textStyleSpecs.length; i += 1) {
    try {
      await figma.loadFontAsync({
        family: textStyleSpecs[i].fontFamily,
        style: textStyleSpecs[i].fontStyle,
      });
      loadableTextStyleSpecs.push(textStyleSpecs[i]);
    } catch (error) {
      const label = `${textStyleSpecs[i].fontFamily} ${textStyleSpecs[i].fontStyle}`;
      warnings.push(`Skipped text style "${textStyleSpecs[i].name}" (missing font: ${label}).`);
    }
  }

  for (let i = 0; i < loadableTextStyleSpecs.length; i += 1) {
    upsertTextStyle(textStyles, loadableTextStyleSpecs[i]);
    createdOrUpdatedTextStyles.push(loadableTextStyleSpecs[i].name);
  }

  return {
    paintCount: createdOrUpdatedPaintStyles.length,
    effectCount: createdOrUpdatedEffectStyles.length,
    textCount: createdOrUpdatedTextStyles.length,
    warnings,
  };
}

figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) {
    return;
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
    return;
  }

  const tokens = msg.tokens;
  const options = msg.options || {};

  if (!tokens || typeof tokens !== "object") {
    postStatus("Paste token JSON or load a token JSON file first.", true);
    return;
  }

  try {
    if (msg.type === "import-tokens") {
      postStatus("Creating variables…", false);
      const result = await importTokensAsVariables(tokens);
      const message = `Variables ready (created ${result.createdCount}, wrote ${result.writtenCount}).`;
      postStatus(message, false);
      figma.notify(message, { timeout: 3000 });
      return;
    }

    if (msg.type === "generate-styles") {
      postStatus("Creating styles…", false);
      const result = await generateStylesFromTokens(tokens, options);
      const warningSummary = result.warnings.length ? ` (${result.warnings.length} warning(s))` : "";
      const message = `Styles ready: ${result.paintCount} colors, ${result.effectCount} effects, ${result.textCount} text${warningSummary}.`;
      postStatus(message, false);
      figma.notify(message, { timeout: 4000 });
      return;
    }

    if (msg.type === "run-all") {
      postStatus("Creating variables…", false);
      const vars = await importTokensAsVariables(tokens);

      postStatus("Creating styles…", false);
      const styles = await generateStylesFromTokens(tokens, options);

      const warningSummary = styles.warnings.length ? ` (${styles.warnings.length} warning(s))` : "";
      const doneMessage =
        `Done: variables (created ${vars.createdCount}, wrote ${vars.writtenCount}); ` +
        `styles (${styles.paintCount} colors, ${styles.effectCount} effects, ${styles.textCount} text)${warningSummary}.`;

      postStatus(doneMessage, false);
      figma.notify(doneMessage, { timeout: 6000 });
      figma.closePlugin(doneMessage);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    postStatus(message, true);
    figma.notify(message, { error: true });
  }
};
