import * as acorn from "https://esm.sh/acorn";
import { generate } from "https://esm.sh/astring";
import semver from "https://esm.sh/semver";

function parseAndFilterExports(code, targetVersion = process.versions.node) {
  const comments = [];
  
  // 1. Parse the code with Acorn, capturing comments and node locations
  const ast = acorn.parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module', // Handles both ESM and CommonJS syntax gracefully
    onComment: comments,
    locations: true
  });

  // 2. Helper to check if a node has a preceding JSDoc comment with strict version rules
  function shouldDropNode(node) {
    const comment = comments.find(c => {
      return c.type === 'Block' && 
             c.value.trim().startsWith('*') && 
             c.end <= node.start && 
             (node.start - c.end) <= 25 && // Proximity check for whitespace/newlines
             (c.value.toLowerCase().includes('@deprecated') || c.value.toLowerCase().includes('@introduced'));
    });

    if (!comment) return false;

    const commentText = comment.value;
    const lower = commentText.toLowerCase();

    // --- Rule A: @deprecated (Drop if version matches deprecation target) ---
    if (lower.includes('@deprecated')) {
      const index = lower.indexOf('@deprecated');
      const after = commentText.substring(index + '@deprecated'.length).trim();
      
      if (!after) return true; // Blanket drop if no constraint specified

      const constraint = after.replace(/^[-:]\s*/, '').split('\n')[0].trim();
      try {
        if (semver.satisfies(targetVersion, constraint)) {
          console.log(`[SemVer Strict Match] @deprecated "${constraint}" matches target ${targetVersion}. Stripping export.`);
          return true;
        }
      } catch (e) {
        console.warn(`[SemVer] Invalid strict constraint format "${constraint}" for @deprecated.`);
      }
    }

    // --- Rule B: @introduced (Drop polyfill if native in target version) ---
    if (lower.includes('@introduced')) {
      const index = lower.indexOf('@introduced');
      const after = commentText.substring(index + '@introduced'.length).trim();
      
      if (!after) return false;

      const constraint = after.replace(/^[-:]\s*/, '').split('\n')[0].trim();
      try {
        if (semver.satisfies(targetVersion, constraint)) {
          console.log(`[SemVer Strict Match] @introduced "${constraint}" matches target ${targetVersion} (Native). Stripping polyfill.`);
          return true;
        }
      } catch (e) {
        console.warn(`[SemVer] Invalid strict constraint format "${constraint}" for @introduced.`);
      }
    }

    return false;
  }

  // Helper to verify if an expression refers to `module.exports` or `exports`
  function isExportsMember(node) {
    if (node.type === 'Identifier' && node.name === 'exports') return true;
    if (node.type === 'MemberExpression') {
      if (node.object.type === 'Identifier' && node.object.name === 'module' &&
          node.property.type === 'Identifier' && node.property.name === 'exports') {
        return true;
      }
    }
    return false;
  }

  // 3. Filter AST nodes for both ESM and CommonJS exports
  ast.body = ast.body.filter(node => {
    
    // --- Pattern A: ESM Named Exports (export function foo() {}) ---
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      if (shouldDropNode(node.declaration)) {
        console.log(`[ESM] Skipping export: ${node.declaration.id?.name || 'anonymous'}`);
        return false;
      }
    }

    // --- Pattern B: CommonJS Assignments & Object Literals ---
    if (node.type === 'ExpressionStatement' && 
        node.expression.type === 'AssignmentExpression' &&
        node.expression.operator === '=') {
      
      const { left, right } = node.expression;
      
      // Case 1: module.exports = { activeFeature, oldFeature }
      if (isExportsMember(left) && right.type === 'ObjectExpression') {
        right.properties = right.properties.filter(prop => {
          if (prop.type === 'Property' && shouldDropNode(prop)) {
            const propName = prop.key.name || prop.key.value;
            console.log(`[CJS Object] Skipping property: ${propName}`);
            return false;
          }
          return true;
        });

        // Drop the whole statement if all exported properties are removed
        if (right.properties.length === 0) return false;
      }

      // Case 2: exports.oldFeature = ... or module.exports.oldFeature = ...
      if (left.type === 'MemberExpression' && isExportsMember(left.object)) {
        if (shouldDropNode(node)) {
          const propName = left.property.name || left.property.value;
          console.log(`[CJS Assignment] Skipping export: ${propName}`);
          return false;
        }
      }
    }

    return true;
  });

  // 4. Generate and return the final code string using astring
  return generate(ast);
}

// --- Example Test Code (Strict SemVer Ranges) ---
const sourceCode = `
  /**
   * @deprecated >=18
   */
  export function deprecated18AndUp() { return "old"; }

  /**
   * @deprecated =20.5.0
   */
  export function deprecatedExact20() { return "specific"; }

  export function activeFeature() { return "active"; }
  
  /**
   * @introduced >=18
   */
  export function helloWorld() { return "hello"; }
`;

// Test with Node 18.16.0 (helloWorld dropped because it's native >=18; deprecated18AndUp dropped because >=18 matches)
console.log("=== Test with Node 18.16.0 ===");
console.log(parseAndFilterExports(sourceCode, "18.16.0"));

// Test with Node 16.0.0 (helloWorld kept because Node 16 doesn't have it natively yet)
console.log("\n=== Test with Node 16.0.0 ===");
console.log(parseAndFilterExports(sourceCode, "16.0.0"));
