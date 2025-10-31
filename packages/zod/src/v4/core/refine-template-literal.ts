import z, { type ZodSafeParseResult, type core, type ZodType } from "zod/v4";

// TODO Move into ZodTemplateLiteral

// Type-preserving version of array.join
function insertDelimiterIntoTuple<const Parts extends readonly T[], Delimiter extends T, T = unknown>(
  lst: Parts,
  delim: Delimiter
): InsertDelimiterIntoTuple<Parts, Delimiter, T> {
  const out = [];
  if (lst.length > 0) {
    out.push(lst[0]);
  }
  for (let i = 1; i < lst.length; i++) {
    out.push(delim);
    out.push(lst[i]);
  }
  return out as InsertDelimiterIntoTuple<Parts, Delimiter, T>;
}

// Type-level equivalent of array.join
type InsertDelimiterIntoTuple<Parts extends readonly T[], Delimiter extends T, T = unknown> = Parts extends []
  ? []
  : Parts extends [infer First extends T]
    ? [First]
    : Parts extends [infer First extends T, ...infer Rest extends T[]]
      ? [First, Delimiter, ...InsertDelimiterIntoTuple<Rest, Delimiter, T>]
      : never;

// Type-preserving version of str.spit
function splitIntoTemplateLiterals<S extends string, D extends string>(str: S, delimiter: D): SplitString<S, D> {
  return str.split(delimiter) as unknown as SplitString<S, D>;
}

// Type-preserving version of mapping safeParse over an array
function mapSafeParse<
  const Parts extends readonly (core.$ZodTemplateLiteralPart & ZodType)[],
  const UnparsedValues extends readonly unknown[],
>(parts: Parts, unparsedValues: UnparsedValues): MapSafeParse<Parts> {
  return parts.map((schema, i) => schema.safeParse(unparsedValues[i])) as unknown as MapSafeParse<Parts>;
}

// Type-level equivalent of mapping safeParse over an array
type MapSafeParse<Parts extends readonly ZodType[]> = Parts extends readonly []
  ? readonly []
  : Parts extends readonly [infer First extends ZodType]
    ? readonly [ZodSafeParseResult<First>]
    : Parts extends readonly [infer First extends ZodType, ...infer Rest extends readonly ZodType[]]
      ? readonly [ZodSafeParseResult<First>, ...MapOutput<Rest>]
      : never;

// Type-level equivalent of mapping z.output over an array
type MapOutput<Parts extends readonly ZodType[]> = Parts extends readonly []
  ? readonly []
  : Parts extends readonly [infer First extends ZodType]
    ? readonly [z.output<First>]
    : Parts extends readonly [infer First extends ZodType, ...infer Rest extends readonly ZodType[]]
      ? readonly [z.output<First>, ...MapOutput<Rest>]
      : never;

// Type-level equivalent of str.split
type SplitString<S extends string, D extends string> = D extends ""
  ? S extends ""
    ? readonly []
    : StringToCharTuple<S>
  : S extends ""
    ? readonly [""]
    : S extends `${infer Head}${D}${infer Tail}`
      ? readonly [Head, ...SplitString<Tail, D>]
      : readonly [S];
// helper: split a non-empty string into its characters
type StringToCharTuple<S extends string> = S extends `${infer First}${infer Rest}`
  ? readonly [First, ...StringToCharTuple<Rest>]
  : readonly [];

// MAIN FUNCTION

// TODO  Allow Delimiter to be z.literal as well as a string
// TODO  Handle "literal" literals: just $ZodTemplateLiteralPart, instead of that & ZodType
export function refineTemplateLiteral<
  const Parts extends readonly (core.$ZodTemplateLiteralPart & ZodType)[],
  Delimiter extends string,
>(
  parts: Parts,
  delim: Delimiter,
  check: (values: MapOutput<Parts>) => boolean,
  templateLiteralParams?: string | z.core.$ZodTemplateLiteralParams,
  checkParams?: string | core.$ZodCustomParams
) {
  const partsWithSeparators: InsertDelimiterIntoTuple<Parts, Delimiter, core.$ZodTemplateLiteralPart> =
    insertDelimiterIntoTuple(parts, delim);

  return z.templateLiteral(partsWithSeparators, templateLiteralParams).refine((compositeValue) => {
    const unparsedValues = splitIntoTemplateLiterals(compositeValue, delim);
    const results = mapSafeParse(parts, unparsedValues); // TODO? Length verification?
    if (!results.every((x) => x.success)) {
      return false;
    }
    const data = results.map((r) => r.data) as MapOutput<Parts>;
    return check(data);
  }, checkParams);
}
