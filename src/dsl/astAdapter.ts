import type { AstNode, DslRole } from './astTypes';
import type { AstLeaf } from './walkContext';

/**
 * Strip the leading "objects." prefix from a walker schema path.
 * e.g. "objects.rect" → "rect", "objects.fill" → "fill".
 * Document-level paths (e.g. "name", "background") are unchanged.
 */
function localSchemaPath(path: string): string {
  if (path.startsWith('objects.')) return path.slice('objects.'.length);
  return path;
}

/**
 * Return true if a leaf belongs inside the same keyword compound that was
 * started by keywordLeaf (i.e. it shares the objects.X prefix and is not
 * itself a new keyword).
 */
function sameCompound(keywordLeaf: AstLeaf, leaf: AstLeaf): boolean {
  if (leaf.dslRole === 'keyword') return false; // new compound starts
  return (
    leaf.schemaPath === keywordLeaf.schemaPath ||
    leaf.schemaPath.startsWith(keywordLeaf.schemaPath + '.')
  );
}

/**
 * Build one compound AstNode for a keyword leaf plus the subsequent leaves
 * that belong to it. Advances i past all consumed leaves and returns the
 * resulting compound (or a bare keyword node when there are no followers).
 */
function buildCompound(
  leaves: AstLeaf[],
  startIdx: number,
  parent: AstNode,
): { node: AstNode; nextIdx: number } {
  const keyLeaf = leaves[startIdx];
  const keySchemaPath = localSchemaPath(keyLeaf.schemaPath);

  const keywordNode: AstNode = {
    schemaPath: keySchemaPath,
    modelPath: keyLeaf.modelPath,
    from: keyLeaf.from,
    to: keyLeaf.to,
    value: keyLeaf.value,
    dslRole: 'keyword',
    schema: keyLeaf.schema,
    children: [],
  };

  let i = startIdx + 1;
  let compoundTo = keyLeaf.to;
  const members: AstNode[] = [keywordNode];

  while (i < leaves.length && sameCompound(keyLeaf, leaves[i])) {
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

  const compound: AstNode = {
    schemaPath: keySchemaPath,
    modelPath: keyLeaf.modelPath,
    from: keyLeaf.from,
    to: compoundTo,
    dslRole: 'compound',
    parent,
    children: members,
  };

  for (const m of members) {
    m.parent = compound;
  }

  return { node: compound, nextIdx: i };
}

/**
 * Convert walker AstLeaf[] into a hierarchical AstNode tree that the
 * completionPlugin and clickPopupPlugin consumers expect.
 *
 * The tree structure mirrors what the old parser produced:
 *
 *   document
 *     section (dslRole='section', schemaPath='objects')
 *       compound (node-line, one per object)
 *         value   (id leaf)
 *         compound (rect / fill / stroke etc.)
 *           keyword
 *           value ...
 *     [non-object top-level leaves placed directly under document]
 *
 * SchemaPath is normalized: "objects.rect" → "rect" so that
 * getPropertySchema(schemaPath, NodeSchema) resolves correctly.
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

  // Separate object leaves (objects.*) from document-level leaves.
  const objectLeaves: AstLeaf[] = [];
  const docLeaves: AstLeaf[] = [];
  for (const leaf of leaves) {
    if (leaf.schemaPath.startsWith('objects.')) {
      objectLeaves.push(leaf);
    } else {
      docLeaves.push(leaf);
    }
  }

  // ── Build section(objects) from object leaves ──────────────────
  if (objectLeaves.length > 0) {
    const sectionFrom = objectLeaves[0].from;
    const sectionTo = objectLeaves[objectLeaves.length - 1].to;

    const section: AstNode = {
      schemaPath: 'objects',
      modelPath: 'objects',
      from: sectionFrom,
      to: sectionTo,
      dslRole: 'section',
      parent: root,
      children: [],
    };
    root.children.push(section);

    // Group leaves into per-node compound lines.
    // A new node-line compound starts at each "objects.id" leaf.
    let i = 0;
    while (i < objectLeaves.length) {
      const leaf = objectLeaves[i];

      if (leaf.dslRole === 'value' && leaf.schemaPath === 'objects.id') {
        // This starts a new node-line compound.
        // Collect all leaves until the next id leaf.
        const nodeLineStart = i;
        i++;
        while (
          i < objectLeaves.length &&
          !(objectLeaves[i].dslRole === 'value' && objectLeaves[i].schemaPath === 'objects.id')
        ) {
          i++;
        }
        const nodeLineLeaves = objectLeaves.slice(nodeLineStart, i);

        // Build the node-line compound.
        const nodeLineFrom = nodeLineLeaves[0].from;
        const nodeLineTo = nodeLineLeaves[nodeLineLeaves.length - 1].to;

        // Use the id value as the modelPath label.
        const nodeId = String(nodeLineLeaves[0].value ?? '');

        const nodeLineCompound: AstNode = {
          schemaPath: '',
          modelPath: `objects.${nodeId}`,
          from: nodeLineFrom,
          to: nodeLineTo,
          dslRole: 'compound',
          parent: section,
          children: [],
        };
        section.children.push(nodeLineCompound);

        // Extend section range to cover this node.
        if (nodeLineTo > section.to) section.to = nodeLineTo;

        // Add id value leaf directly.
        const idNode: AstNode = {
          schemaPath: 'id',
          modelPath: `objects.${nodeId}.id`,
          from: nodeLineLeaves[0].from,
          to: nodeLineLeaves[0].to,
          value: nodeLineLeaves[0].value,
          dslRole: 'value',
          parent: nodeLineCompound,
          children: [],
        };
        nodeLineCompound.children.push(idNode);

        // Parse remaining leaves of this node-line into compounds.
        let j = 1; // skip the id leaf
        while (j < nodeLineLeaves.length) {
          const nl = nodeLineLeaves[j];
          if (nl.dslRole === 'keyword') {
            const { node: compound, nextIdx } = buildCompound(nodeLineLeaves, j, nodeLineCompound);
            nodeLineCompound.children.push(compound);
            j = nextIdx;
          } else {
            // Non-keyword leaf at node-line level (kwarg, value, etc.)
            const leafNode: AstNode = {
              schemaPath: localSchemaPath(nl.schemaPath),
              modelPath: nl.modelPath,
              from: nl.from,
              to: nl.to,
              value: nl.value,
              dslRole: nl.dslRole as DslRole,
              schema: nl.schema,
              parent: nodeLineCompound,
              children: [],
            };
            nodeLineCompound.children.push(leafNode);
            j++;
          }
        }
      } else {
        // Stray object leaf not starting with id — add to section directly.
        const node: AstNode = {
          schemaPath: localSchemaPath(leaf.schemaPath),
          modelPath: leaf.modelPath,
          from: leaf.from,
          to: leaf.to,
          value: leaf.value,
          dslRole: leaf.dslRole as DslRole,
          schema: leaf.schema,
          parent: section,
          children: [],
        };
        section.children.push(node);
        i++;
      }
    }
  }

  // ── Document-level leaves ──────────────────────────────────────
  let i = 0;
  while (i < docLeaves.length) {
    const leaf = docLeaves[i];
    if (leaf.dslRole === 'keyword') {
      const { node: compound, nextIdx } = buildCompound(docLeaves, i, root);
      root.children.push(compound);
      i = nextIdx;
    } else {
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
