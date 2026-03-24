import type { SchemaSpan, SchemaSection, RenderResult } from './schemaSpan';

export class DslBuilder {
  private parts: string[] = [];
  private spans: SchemaSpan[] = [];
  private offset = 0;
  private section: SchemaSection;

  constructor(section: SchemaSection) {
    this.section = section;
  }

  /** Write syntax/structural text (no span). */
  write(text: string): this {
    this.parts.push(text);
    this.offset += text.length;
    return this;
  }

  /** Write a value token and record a span for it. */
  writeSpan(text: string, schemaPath: string, modelPath: string): this {
    const from = this.offset;
    this.parts.push(text);
    this.offset += text.length;
    this.spans.push({ from, to: this.offset, schemaPath, modelPath, section: this.section });
    return this;
  }

  /** Get current character offset. */
  get pos(): number {
    return this.offset;
  }

  build(): RenderResult {
    return { text: this.parts.join(''), spans: this.spans };
  }
}
