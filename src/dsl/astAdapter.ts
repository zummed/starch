import type { AstNode, DslRole } from './astTypes';
import type { AstLeaf } from './walkContext';

/**
 * Strip the leading "objects." prefix that the schema walker uses for object
 * properties (e.g. "objects.rect" → "rect"). Document-level paths (e.g.
 * "name", "background") are left unchanged.
 */
function localSchemaPath(path: string): string {
  if (path.startsWith('objects.')) return path.slice('objects.'.length);
  return path;
}

/**
 * Return true if a leaf belongs inside a compound started by the given
 * keyword leaf (i.e. they share the same objects.X prefix and the leaf is
 * not a new top-level keyword for a different property).
 */
function sameCompound(keywordLeaf: AstLeaf, leaf: AstLeaf): boolean {
  if (leaf.dslRole === 'keyword') return false;  // new compound starts
  // The keyword has schemaPath like "objects.fill" or "objects.stroke".
  // Members of that compound have schemaPath "objects.fill", "objects.fill.xxx",
  // "objects.stroke.color", "objects.stroke.width" etc.
  return (
    leaf.schemaPath === keywordLeaf.schemaPath ||
    leaf.schemaPath.startsWith(keywordLeaf.schemaPath + '.')
  );
}

/**
 * Build an AstNode tree from walker leaves that is compatible with the
 * nodeAt() / findCompound() API used by clickPopupPlugin and completionPlugin.
 *
 * Structure:
 *   document
 *     compound (schemaPath="rect", dslRole="compound")
 *       keyword  (schemaPath="rect")
 *       value    (schemaPath="rect.w")
 *       ...
 *     compound (schemaPath="fill")
 *       keyword  (schemaPath="fill")
 *       value    (schemaPath="fill")
 *     ...
 *     [non-keyword leaves that don't start a compound are added directly]
 *
 * SchemaPath is normalized: "objects.rect" → "rect" so that consumers
 * calling getPropertySchema(schemaPath, NodeSchema) resolve correctly.
 */
export function leavesToAst(leaves: AstLeaf[], textLength: number): AstNode {
  const root: AstNode = {
    schemaPath: '',
    modelPath: '',
    from: 0,
    to: textLength,
    children: [],
    dslRole: 'document',
  };

  let i = 0;
  while (i < leaves.length) {
    const leaf = leaves[i];

    if (leaf.dslRole === 'keyword') {
      // Start a compound node.
      const keywordSchemaPath = localSchemaPath(leaf.schemaPath);

      const keywordNode: AstNode = {
        schemaPath: keywordSchemaPath,
        modelPath: leaf.modelPath,
        from: leaf.from,
        to: leaf.to,
        value: leaf.value,
        dslRole: 'keyword',
        schema: leaf.schema,
        children: [],
      };

      // Collect all leaves that belong to this compound.
      i++;
      let compoundTo = leaf.to;
      const members: AstNode[] = [keywordNode];

      while (i < leaves.length && sameCompound(leaf, leaves[i])) {
        const ml = leaves[i];
        const memberNode: AstNode = {
          schemaPath: localSchemaPath(ml.schemaPath),
          modelPath: ml.modelPath,
          from: ml.from,
          to: ml.to,
          value: ml.value,
          dslRole: ml.dslRole as DslRole,
          schema: ml.schema,
          children: [],
        };
        members.push(memberNode);
        compoundTo = ml.to;
        i++;
      }

      // If there are any members besides the keyword, wrap in a compound node.
      // If it's just the keyword alone, still wrap it so findCompound() returns self.
      const compound: AstNode = {
        schemaPath: keywordSchemaPath,
        modelPath: leaf.modelPath,
        from: leaf.from,
        to: compoundTo,
        dslRole: 'compound',
        children: members,
      };

      // Wire parent references.
      compound.parent = root;
      for (const m of members) {
        m.parent = compound;
      }

      root.children.push(compound);
    } else {
      // Non-keyword leaf (e.g. id value, separator, etc.) — add directly.
      const node: AstNode = {
        schemaPath: localSchemaPath(leaf.schemaPath),
        modelPath: leaf.modelPath,
        from: leaf.from,
        to: leaf.to,
        value: leaf.value,
        dslRole: leaf.dslRole as DslRole,
        schema: leaf.schema,
        parent: root,
        children: [],
      };
      root.children.push(node);
      i++;
    }
  }

  return root;
}
