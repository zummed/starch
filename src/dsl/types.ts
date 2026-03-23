export type TokenType =
  | 'identifier'     // node IDs, keywords (rect, fill, at, style, etc.)
  | 'number'         // 42, 3.14, -10
  | 'string'         // "hello world" (value WITHOUT quotes)
  | 'arrow'          // ->
  | 'colon'          // :
  | 'equals'         // =
  | 'dot'            // .
  | 'doubleDot'      // ..
  | 'atSign'         // @ (style reference prefix)
  | 'plus'           // + (relative time prefix)
  | 'dimensions'     // 160x100 (WxH shorthand, value is "160x100")
  | 'parenOpen'      // (
  | 'parenClose'     // )
  | 'braceOpen'      // { (JSON escape hatch start)
  | 'braceClose'     // }
  | 'comma'          // ,
  | 'newline'        // significant newline (blank lines collapsed)
  | 'indent'         // indentation increase (2 spaces)
  | 'dedent'         // indentation decrease
  | 'hexColor'       // #3B82F6 (value includes the #)
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  offset: number;
}
