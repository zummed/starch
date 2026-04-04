import type { Token, TokenType } from './types';
import type { z } from 'zod';

export type DslRole =
  | 'keyword' | 'value' | 'kwarg-key' | 'kwarg-value'
  | 'flag' | 'sigil' | 'separator';

export interface AstLeaf {
  schemaPath: string;
  modelPath: string;
  from: number;
  to: number;
  value: unknown;
  dslRole: DslRole;
  schema?: z.ZodType;
}

/**
 * Walker state. Holds the token cursor, model path stack, and
 * accumulated AST leaves. Used by the schema-driven walker to
 * consume tokens and build the model + AST in a single pass.
 */
export class WalkContext {
  private pos = 0;
  private pathStack: string[] = [];
  private leaves: AstLeaf[] = [];

  constructor(
    private tokens: Token[],
    public readonly text: string,
  ) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  is(type: TokenType, value?: string): boolean {
    const tok = this.peek();
    if (!tok || tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  }

  atEnd(): boolean {
    const tok = this.peek();
    return !tok || tok.type === 'eof';
  }

  pushPath(segment: string): void {
    this.pathStack.push(segment);
  }

  popPath(): void {
    this.pathStack.pop();
  }

  modelPath(): string {
    return this.pathStack.join('.');
  }

  skipNewlines(): void {
    while (this.is('newline')) this.next();
  }

  /**
   * Skip all tokens until the next newline, indent, dedent, or eof.
   * Used to discard the remainder of a line when parsing stops early.
   */
  skipToNewline(): void {
    while (!this.atEnd()) {
      const t = this.peek();
      if (!t) break;
      if (t.type === 'newline' || t.type === 'indent' || t.type === 'dedent') break;
      this.next();
    }
  }

  emitLeaf(leaf: Omit<AstLeaf, 'modelPath'> & { modelPath?: string }): void {
    this.leaves.push({
      modelPath: leaf.modelPath ?? this.modelPath(),
      ...leaf,
    });
  }

  astLeaves(): AstLeaf[] {
    return this.leaves;
  }
}
