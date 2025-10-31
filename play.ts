import z from "zod";
import { refineTemplateLiteral } from "./packages/zod/src/v4/core/refine-template-literal.js";

const DaySchema = z.int().positive();
const MonthSchema = z.number().positive().max(11);
const verify = (vals: readonly [number, number]) => {
    if ([4, 6, 9, 11].includes(vals[1])) {
        return vals[0] <= 30;
    }
    if (vals[1] === 2) {
        return vals[0] <= 29;
    }
    return vals[0] <= 31;
};

const DateSchema = refineTemplateLiteral(
    [DaySchema, MonthSchema],
    ",",
    verify,
    {},
    {error: "Verify failed!"}
);

console.log(DateSchema.safeParse("7,11"));  // Valid
console.log(DateSchema.safeParse("31/11"));  // Invalid (doesn't match schema)
console.log(DateSchema.safeParse("31,11"));  // Invalid (failed verify)
