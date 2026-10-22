import { Schema } from "mongoose";

export const ObjectId = Schema.Types.ObjectId;

/** Integer minor units (fils for AED). */
export const money = (required = true) => ({
  type: Number,
  required,
  validate: { validator: (v: number | null | undefined) => v == null || Number.isSafeInteger(v), message: "Amounts are integer minor units" },
});

/** Unique only when the field holds a value (Mongo treats missing as null in unique indexes). */
export const partialUnique = (field: string, type: "string" | "objectId" = "string") => ({ unique: true, partialFilterExpression: { [field]: { $type: type } } });

export const timestamps = { timestamps: true, versionKey: false } as const;
