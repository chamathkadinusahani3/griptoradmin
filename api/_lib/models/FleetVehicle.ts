import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A delivery/field vehicle (lorry, van, motorbike, etc.) — distinct from the
// existing customer-owned `Vehicle` model (garage job-card vehicles).
// `vehicleType` and `capacityUnit` are deliberately free text, not a fixed
// enum: SF-Phase 9's load-to-vehicle suggestion logic needs to be
// tenant-configurable rather than hard-coded against a closed vehicle-type
// list.
const FleetVehicleSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    vehicleNumber: { type: String, required: true },
    vehicleType: { type: String, required: true },
    capacity: { type: Number },
    capacityUnit: { type: String, default: 'cubic ft' },
    driverId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    status: { type: String, enum: ['Active', 'Inactive', 'In Maintenance'], default: 'Active' },
    // Distance (km) this vehicle covers per liter of fuel — used by
    // SF-Phase 10's trip fuel-cost estimate. Default 0 (not configured) is
    // backward-compatible and simply means no fuel estimate is shown.
    fuelEfficiency: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type FleetVehicleDoc = InferSchemaType<typeof FleetVehicleSchema> & { _id: mongoose.Types.ObjectId };

export const FleetVehicle = mongoose.models.FleetVehicle || mongoose.model('FleetVehicle', FleetVehicleSchema);
