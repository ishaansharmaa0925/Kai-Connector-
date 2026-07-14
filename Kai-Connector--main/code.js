figma.showUI(__html__, {
  width: 744,
  height: 456,
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

const GENERATED_SHADE_STEPS = {
  100: { mix: "white", amount: 0.88 },
  200: { mix: "white", amount: 0.74 },
  300: { mix: "white", amount: 0.58 },
  400: { mix: "white", amount: 0.32 },
  500: { mix: "base", amount: 0 },
  600: { mix: "black", amount: 0.12 },
  700: { mix: "black", amount: 0.24 },
  800: { mix: "black", amount: 0.4 },
  900: { mix: "black", amount: 0.58 },
};

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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isTokenLeafObject(value) {
  return isPlainObject(value) && (hasOwn(value, "value") || hasOwn(value, "$value"));
}

function unwrapTokenLeaf(value) {
  if (!isTokenLeafObject(value)) {
    return value;
  }

  if (hasOwn(value, "$value")) {
    return value.$value;
  }

  return value.value;
}

function normalizeTokenTree(node) {
  const unwrapped = unwrapTokenLeaf(node);

  if (unwrapped !== node) {
    return normalizeTokenTree(unwrapped);
  }

  if (Array.isArray(node)) {
    return node.map(normalizeTokenTree);
  }

  if (!isPlainObject(node)) {
    return node;
  }

  const result = {};

  for (const key in node) {
    if (!hasOwn(node, key)) {
      continue;
    }

    result[key] = normalizeTokenTree(node[key]);
  }

  return result;
}

function roundChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbaUnitTo255(value) {
  return roundChannel(clamp01(value) * 255);
}

function rgbaToHex(value, includeAlpha) {
  const r = rgbaUnitTo255(value.r).toString(16).padStart(2, "0");
  const g = rgbaUnitTo255(value.g).toString(16).padStart(2, "0");
  const b = rgbaUnitTo255(value.b).toString(16).padStart(2, "0");
  const a = rgbaUnitTo255(value.a === undefined ? 1 : value.a).toString(16).padStart(2, "0");
  return `#${r}${g}${b}${includeAlpha ? a : ""}`.toUpperCase();
}

function mixRgba(base, mixWith, amount) {
  return {
    r: clamp01(base.r * (1 - amount) + mixWith.r * amount),
    g: clamp01(base.g * (1 - amount) + mixWith.g * amount),
    b: clamp01(base.b * (1 - amount) + mixWith.b * amount),
    a: clamp01((base.a === undefined ? 1 : base.a) * (1 - amount) + (mixWith.a === undefined ? 1 : mixWith.a) * amount),
  };
}

function extractSeedValue(candidate) {
  const unwrapped = unwrapTokenLeaf(candidate);

  if (typeof unwrapped === "string") {
    return unwrapped;
  }

  if (isPlainObject(unwrapped)) {
    const priorityKeys = ["500", "main", "base", "default", "primary", "value", "$value"];

    for (let i = 0; i < priorityKeys.length; i += 1) {
      const key = priorityKeys[i];
      if (hasOwn(unwrapped, key)) {
        return extractSeedValue(unwrapped[key]);
      }
    }
  }

  return unwrapped;
}

function getFirstDefined(root, paths) {
  for (let i = 0; i < paths.length; i += 1) {
    const candidate = getByPath(root, paths[i]);
    if (candidate !== undefined && candidate !== null) {
      return extractSeedValue(candidate);
    }
  }

  return undefined;
}

function ensureSeedColor(value, fallbackHex) {
  if (value === undefined || value === null || value === "") {
    return fallbackHex;
  }

  return rgbaToHex(parseColorToRgba(value), false);
}

function createShadeScale(seedColor) {
  const base = parseColorToRgba(seedColor);
  const white = { r: 1, g: 1, b: 1, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const scale = {};
  const keys = Object.keys(GENERATED_SHADE_STEPS);

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const step = GENERATED_SHADE_STEPS[key];

    if (step.mix === "base") {
      scale[key] = rgbaToHex(base, base.a < 1);
      continue;
    }

    scale[key] = rgbaToHex(mixRgba(base, step.mix === "white" ? white : black, step.amount), base.a < 1);
  }

  return scale;
}

function alphaColor(color, alpha) {
  const rgba = parseColorToRgba(color);
  return `rgba(${rgbaUnitTo255(rgba.r)}, ${rgbaUnitTo255(rgba.g)}, ${rgbaUnitTo255(rgba.b)}, ${alpha})`;
}

function createReferenceScale(path) {
  return {
    100: `{${path}.100}`,
    200: `{${path}.200}`,
    300: `{${path}.300}`,
    400: `{${path}.400}`,
    500: `{${path}.500}`,
    600: `{${path}.600}`,
    700: `{${path}.700}`,
    800: `{${path}.800}`,
    900: `{${path}.900}`,
  };
}

function buildGeneratedTokenSet(root) {
  const primarySeed = getFirstDefined(root, [
    "primary",
    "colors.primary",
    "palette.primary",
    "brand.primary",
    "theme.primary",
  ]);

  if (primarySeed === undefined) {
    return null;
  }

  const primary = ensureSeedColor(primarySeed, "#3B82F6");
  const secondary = ensureSeedColor(
    getFirstDefined(root, ["secondary", "colors.secondary", "palette.secondary", "brand.secondary", "theme.secondary"]),
    "#7C3AED"
  );
  const tertiary = ensureSeedColor(
    getFirstDefined(root, ["tertiary", "colors.tertiary", "palette.tertiary", "brand.tertiary", "theme.tertiary"]),
    "#14B8A6"
  );
  const success = ensureSeedColor(
    getFirstDefined(root, ["success", "colors.success", "status.success", "semantic.status.success"]),
    "#16A34A"
  );
  const warning = ensureSeedColor(
    getFirstDefined(root, ["warning", "colors.warning", "status.warning", "semantic.status.warning"]),
    "#F59E0B"
  );
  const error = ensureSeedColor(
    getFirstDefined(root, ["error", "colors.error", "status.error", "semantic.status.error", "danger"]),
    "#DC2626"
  );
  const notification = ensureSeedColor(
    getFirstDefined(root, ["notification", "colors.notification", "info", "colors.info", "status.info", "semantic.status.info"]),
    "#2563EB"
  );
  const neutral = ensureSeedColor(
    getFirstDefined(root, ["neutral", "colors.neutral", "palette.neutral", "brand.neutral"]),
    "#475569"
  );

  const primaryScale = createShadeScale(primary);
  const secondaryScale = createShadeScale(secondary);
  const tertiaryScale = createShadeScale(tertiary);
  const successScale = createShadeScale(success);
  const warningScale = createShadeScale(warning);
  const errorScale = createShadeScale(error);
  const notificationScale = createShadeScale(notification);
  const neutralScale = createShadeScale(neutral);

  const fontFamily = String(
    getFirstDefined(root, ["typography.fontFamily", "fontFamily", "fonts.primary", "theme.fontFamily"]) || "Nunito"
  );
  const monoFontFamily = String(
    getFirstDefined(root, ["typography.monoFontFamily", "monoFontFamily", "fonts.mono", "theme.monoFontFamily"]) ||
      "Roboto Mono"
  );

  return {
    primitives: {
      color: {
        primary: primaryScale,
        secondary: secondaryScale,
        tertiary: tertiaryScale,
        success: successScale,
        warning: warningScale,
        error: errorScale,
        notification: notificationScale,
        neutral: neutralScale,
        background: {
          default: neutralScale[100],
          surface: "#FFFFFF",
          elevated: neutralScale[200],
        },
        text: {
          primary: neutralScale[900],
          secondary: neutralScale[700],
          muted: neutralScale[600],
          inverse: "#FFFFFF",
        },
        border: {
          subtle: neutralScale[200],
          default: neutralScale[300],
          strong: neutralScale[500],
        },
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
        16: "64px",
      },
      radius: {
        none: "0px",
        xs: "2px",
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        xxl: "24px",
        pill: "9999px",
      },
      shadow: {
        xs: `0px 1px 2px ${alphaColor(neutralScale[900], 0.12)}`,
        sm: `0px 4px 10px ${alphaColor(neutralScale[900], 0.14)}`,
        md: `0px 10px 24px ${alphaColor(neutralScale[900], 0.18)}`,
        lg: `0px 18px 40px ${alphaColor(neutralScale[900], 0.22)}`,
      },
    },
    semantic: {
      color: {
        brand: {
          primary: "{primitives.color.primary.500}",
          secondary: "{primitives.color.secondary.500}",
          tertiary: "{primitives.color.tertiary.500}",
        },
        bg: {
          canvas: "{primitives.color.background.default}",
          surface: "{primitives.color.background.surface}",
          elevated: "{primitives.color.background.elevated}",
          brand: "{primitives.color.primary.500}",
        },
        text: {
          primary: "{primitives.color.text.primary}",
          secondary: "{primitives.color.text.secondary}",
          muted: "{primitives.color.text.muted}",
          inverse: "{primitives.color.text.inverse}",
          brand: "{primitives.color.primary.700}",
        },
        border: {
          subtle: "{primitives.color.border.subtle}",
          default: "{primitives.color.border.default}",
          strong: "{primitives.color.border.strong}",
          focus: "{primitives.color.primary.500}",
        },
        status: {
          success: createReferenceScale("primitives.color.success"),
          warning: createReferenceScale("primitives.color.warning"),
          error: createReferenceScale("primitives.color.error"),
          notification: createReferenceScale("primitives.color.notification"),
        },
      },
      spacing: {
        cardPadding: "{primitives.spacing.4}",
        sectionGap: "{primitives.spacing.8}",
        pageMargin: "{primitives.spacing.6}",
      },
      radius: {
        button: "{primitives.radius.md}",
        input: "{primitives.radius.md}",
        card: "{primitives.radius.lg}",
        modal: "{primitives.radius.xl}",
      },
      shadow: {
        card: "{primitives.shadow.sm}",
        dropdown: "{primitives.shadow.md}",
        modal: "{primitives.shadow.lg}",
      },
    },
    textStyles: DEFAULT_TEXT_STYLE_SPECS.map((spec) => ({
      ...spec,
      fontFamily: spec.fontFamily === "Roboto Mono" ? monoFontFamily : fontFamily,
    })),
  };
}

function normalizeImportedTokens(rawTokens) {
  if (!isPlainObject(rawTokens)) {
    throw new Error("The token payload must be a JSON object.");
  }

  const root = isPlainObject(rawTokens.tokens) ? rawTokens.tokens : rawTokens;
  const normalizedRoot = normalizeTokenTree(root);

  if (isPlainObject(normalizedRoot.primitives)) {
    return normalizedRoot;
  }

  const generated = buildGeneratedTokenSet(normalizedRoot);
  return generated || normalizedRoot;
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

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function parseRgbChannel(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid color channel "${value}".`);
  }

  return clamp01(parsed / 255);
}

function parseAlphaChannel(value) {
  if (value === undefined) {
    return 1;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid alpha channel "${value}".`);
  }

  return clamp01(parsed);
}

function parseHexColorString(hex) {
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

function parseRgbColorString(input) {
  const rgbaMatch = String(input).match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );

  if (!rgbaMatch) {
    throw new Error(`Unsupported rgb/rgba color "${input}".`);
  }

  return {
    r: parseRgbChannel(rgbaMatch[1]),
    g: parseRgbChannel(rgbaMatch[2]),
    b: parseRgbChannel(rgbaMatch[3]),
    a: parseAlphaChannel(rgbaMatch[4]),
  };
}

function parseObjectColor(input) {
  if (!isPlainObject(input)) {
    throw new Error(`Unsupported color value "${String(input)}".`);
  }

  if (!hasOwn(input, "r") || !hasOwn(input, "g") || !hasOwn(input, "b")) {
    throw new Error(`Unsupported color object "${JSON.stringify(input)}".`);
  }

  const rawR = Number(input.r);
  const rawG = Number(input.g);
  const rawB = Number(input.b);
  const rawA = hasOwn(input, "a") ? Number(input.a) : 1;

  if (![rawR, rawG, rawB, rawA].every(Number.isFinite)) {
    throw new Error(`Invalid color object "${JSON.stringify(input)}".`);
  }

  const uses255Scale = rawR > 1 || rawG > 1 || rawB > 1;

  return {
    r: uses255Scale ? clamp01(rawR / 255) : clamp01(rawR),
    g: uses255Scale ? clamp01(rawG / 255) : clamp01(rawG),
    b: uses255Scale ? clamp01(rawB / 255) : clamp01(rawB),
    a: rawA > 1 ? clamp01(rawA / 255) : clamp01(rawA),
  };
}

function parseColorToRgba(input) {
  const value = unwrapTokenLeaf(input);

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^#/.test(trimmed)) {
      return parseHexColorString(trimmed);
    }

    if (/^rgba?\(/i.test(trimmed)) {
      return parseRgbColorString(trimmed);
    }

    throw new Error(`Unsupported color "${value}".`);
  }

  if (isPlainObject(value)) {
    return parseObjectColor(value);
  }

  throw new Error(`Unsupported color value "${String(value)}".`);
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
  const normalizedTokens = normalizeImportedTokens(tokens);
  const primitives = normalizedTokens && normalizedTokens.primitives;

  if (!primitives || typeof primitives !== "object") {
    throw new Error('Missing token groups. Expected a "primitives" object or "tokens.primitives" object.');
  }

  if (!figma.variables || !figma.variables.createVariableCollection) {
    throw new Error("This Figma file does not support Variables.");
  }

  const localCollections = figma.variables.getLocalVariableCollectionsAsync
    ? await figma.variables.getLocalVariableCollectionsAsync()
    : figma.variables.getLocalVariableCollections();

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

  function getCollectionContext(collectionName) {
    let collection = localCollections.find((item) => item.name === collectionName);

    if (!collection) {
      collection = figma.variables.createVariableCollection(collectionName);
      localCollections.push(collection);
    }

    const modeId = collection.modes[0] && collection.modes[0].modeId;

    if (!modeId) {
      throw new Error(`The "${collectionName}" collection does not have an available mode.`);
    }

    return { collection, modeId };
  }

  function getOrCreateVariable(context, name, resolvedType) {
    const variableName = toVariableName(name);
    const existingVariable = localVariables.find(
      (item) => item.variableCollectionId === context.collection.id && item.name === variableName
    );

    if (existingVariable) {
      if (existingVariable.resolvedType !== resolvedType) {
        throw new Error(
          `Variable "${variableName}" already exists as ${existingVariable.resolvedType}, expected ${resolvedType}.`
        );
      }

      return existingVariable;
    }

    const createdVariable = figma.variables.createVariable(variableName, context.collection, resolvedType);
    localVariables.push(createdVariable);
    createdCount += 1;
    return createdVariable;
  }

  function setVar(context, variable, value) {
    variable.setValueForMode(context.modeId, value);
    writtenCount += 1;
  }

  function createWriters(context) {
    return {
      color(name, value) {
        const variable = getOrCreateVariable(context, name, "COLOR");
        const rgba = parseColorToRgba(value);
        setVar(context, variable, rgba);
      },
      float(name, value) {
        const variable = getOrCreateVariable(context, name, "FLOAT");
        setVar(context, variable, parseNumber(value));
      },
      string(name, value) {
        const variable = getOrCreateVariable(context, name, "STRING");
        setVar(context, variable, String(value));
      },
    };
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

  const primitiveWriters = createWriters(getCollectionContext("Primitives"));

  importNestedGroup("color", primitives.color, primitiveWriters.color);
  importNestedGroup("spacing", primitives.spacing, primitiveWriters.float);
  importNestedGroup("radius", primitives.radius, primitiveWriters.float);
  importNestedGroup("shadow", primitives.shadow, primitiveWriters.string);

  if (isPlainObject(normalizedTokens.semantic)) {
    const aliasWriters = createWriters(getCollectionContext("Aliases"));

    importResolvedGroup("color", normalizedTokens.semantic.color, aliasWriters.color, normalizedTokens);
    importResolvedGroup("spacing", normalizedTokens.semantic.spacing, aliasWriters.float, normalizedTokens);
    importResolvedGroup("radius", normalizedTokens.semantic.radius, aliasWriters.float, normalizedTokens);
    importResolvedGroup("shadow", normalizedTokens.semantic.shadow, aliasWriters.string, normalizedTokens);
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

function parseShadow(value) {
  const match = String(value).match(
    /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+(.+)$/i
  );

  if (!match) {
    throw new Error("Unsupported shadow format: " + value);
  }

  return {
    type: "DROP_SHADOW",
    color: parseColorToRgba(match[5]),
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
  const rgba = parseColorToRgba(hexColor);

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

function isRgbColor(value) {
  return typeof value === "string" && /^rgba?\([^)]+\)$/i.test(value.trim());
}

function isObjectColor(value) {
  const unwrapped = unwrapTokenLeaf(value);
  return isPlainObject(unwrapped) && hasOwn(unwrapped, "r") && hasOwn(unwrapped, "g") && hasOwn(unwrapped, "b");
}

function isSupportedColor(value) {
  return isHexColor(value) || isRgbColor(value) || isObjectColor(value);
}

function isShadowValue(value) {
  return (
    typeof value === "string" &&
    /^-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px)?\s+.+$/i.test(
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
  const normalizedTokens = normalizeImportedTokens(tokens);
  const leaves = collectLeafTokens(normalizedTokens);
  const paintTokens = [];
  const effectTokens = [];
  const warnings = [];

  for (let i = 0; i < leaves.length; i += 1) {
    const leaf = leaves[i];
    let resolvedValue;

    try {
      resolvedValue = resolveTokenValue(leaf.value, normalizedTokens);
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

    if (isSupportedColor(resolvedValue)) {
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
  const normalizedTokens = normalizeImportedTokens(tokens);

  if (normalizedTokens && Array.isArray(normalizedTokens.textStyles) && normalizedTokens.textStyles.length > 0) {
    return normalizedTokens.textStyles;
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
