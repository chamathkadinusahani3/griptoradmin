import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const DELIVERY_ASSIGNMENT_STATUSES = ['Pending', 'Assigned', 'In Transit', 'Delivered', 'Failed', 'Cancelled'] as const;

// Layers dispatch/logistics state (route, driver, vehicle, delivery status)
// on top of an existing SalesOrder — deliberately NOT a new source-of-truth
// for the delivery itself (that's still SalesOrder + the DeliveryNote(s) it
// accumulates on fulfillment). One assignment per SalesOrder (upserted, see
// pending-deliveries/[salesOrderId].ts), since "pending delivery" here means
// "the still-outstanding portion of this order," not a per-DeliveryNote
// concept. This status track is independent of SalesOrder.status: a
// SalesOrder can be Assigned/In Transit here while still Confirmed/
// Partially Fulfilled there — this phase never writes to SalesOrder itself.
const DeliveryAssignmentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    routeId: { type: Schema.Types.ObjectId, ref: 'Route' },
    driverId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'FleetVehicle' },
    status: { type: String, enum: DELIVERY_ASSIGNMENT_STATUSES, default: 'Pending' },
    deliveryDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type DeliveryAssignmentDoc = InferSchemaType<typeof DeliveryAssignmentSchema> & { _id: mongoose.Types.ObjectId };

export const DeliveryAssignment = mongoose.models.DeliveryAssignment || mongoose.model('DeliveryAssignment', DeliveryAssignmentSchema);
