import mongoose, { Schema, InferSchemaType } from 'mongoose';

const DepartmentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    description: { type: String },
  },
  { timestamps: true }
);

export type DepartmentDoc = InferSchemaType<typeof DepartmentSchema> & { _id: mongoose.Types.ObjectId };

export const Department = mongoose.models.Department || mongoose.model('Department', DepartmentSchema);
