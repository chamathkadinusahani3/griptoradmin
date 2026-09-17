import { SalesVisit, SalesVisitDoc } from './models/SalesVisit.js';
import { Salesperson, SalespersonDoc } from './models/Salesperson.js';
import { FleetVehicle, FleetVehicleDoc } from './models/FleetVehicle.js';
import { Client, ClientDoc } from './models/Client.js';

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface VisitTripMetrics {
  tripDistanceKm: number | null;
  estimatedFuelCost: number | null;
}

// Trip distance for a visit = the haversine distance between the
// salesperson's immediately preceding geo-tagged visit (its checkout point
// if captured, else its check-in point) and this visit's check-in point —
// i.e. the actual travel between consecutive field stops, not the near-zero
// distance between a single visit's own check-in and check-out. A visit
// with no prior geo-tagged visit (the salesperson's first ever) gets null,
// never 0 — 0 would misleadingly read as "no travel."
//
// Fuel cost resolves the salesperson's vehicle indirectly, since Salesperson
// has no direct vehicle field: Salesperson.employeeId -> FleetVehicle
// (matched on driverId). No match simply means no fuel estimate — same
// "never block, best-effort attribution" discipline as every other SF
// cross-model lookup in this codebase (see sales-orders/index.ts's
// SalespersonAssignment lookup).
export async function computeVisitTripMetrics(clientId: string, visits: SalesVisitDoc[]): Promise<Map<string, VisitTripMetrics>> {
  const result = new Map<string, VisitTripMetrics>();
  const geoVisits = visits.filter((v) => v.checkInLat != null && v.checkInLng != null);
  if (geoVisits.length === 0) return result;

  const salespersonIds = [...new Set(geoVisits.map((v) => v.salespersonId.toString()))];

  const [history, salespersons, client] = await Promise.all([
    SalesVisit.find({
      clientId,
      salespersonId: { $in: salespersonIds },
      checkInLat: { $ne: null },
    })
      .select('salespersonId checkInAt checkInLat checkInLng checkOutLat checkOutLng')
      .sort({ checkInAt: 1 })
      .lean() as Promise<SalesVisitDoc[]>,
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).select('employeeId').lean() as Promise<SalespersonDoc[]>,
    Client.findById(clientId).select('fuelPricePerLiter').lean() as Promise<ClientDoc | null>,
  ]);

  const historyBySalesperson = new Map<string, SalesVisitDoc[]>();
  for (const h of history) {
    const key = h.salespersonId.toString();
    const existing = historyBySalesperson.get(key);
    if (existing) existing.push(h);
    else historyBySalesperson.set(key, [h]);
  }

  const employeeIdBySalesperson = new Map(salespersons.map((s) => [s._id.toString(), s.employeeId?.toString()]));
  const driverEmployeeIds = [...new Set([...employeeIdBySalesperson.values()].filter((id): id is string => !!id))];
  const vehicles =
    driverEmployeeIds.length > 0
      ? ((await FleetVehicle.find({ clientId, driverId: { $in: driverEmployeeIds } }).select('driverId fuelEfficiency').lean()) as FleetVehicleDoc[])
      : [];
  const fuelEfficiencyByDriverEmployeeId = new Map(vehicles.map((v) => [v.driverId?.toString(), v.fuelEfficiency ?? 0]));
  const fuelPricePerLiter = client?.fuelPricePerLiter ?? 0;

  for (const visit of geoVisits) {
    const checkInLat = visit.checkInLat;
    const checkInLng = visit.checkInLng;
    if (checkInLat == null || checkInLng == null) continue; // geoVisits is already filtered to exclude this; narrows types below

    const spId = visit.salespersonId.toString();
    const chain = historyBySalesperson.get(spId) ?? [];
    const idx = chain.findIndex((h) => h._id.toString() === visit._id.toString());
    const prior = idx > 0 ? chain[idx - 1] : null;
    const originLat = prior?.checkOutLat ?? prior?.checkInLat;
    const originLng = prior?.checkOutLng ?? prior?.checkInLng;

    if (!prior || originLat == null || originLng == null) {
      result.set(visit._id.toString(), { tripDistanceKm: null, estimatedFuelCost: null });
      continue;
    }

    const tripDistanceKm = Math.round(haversineDistanceKm(originLat, originLng, checkInLat, checkInLng) * 100) / 100;

    const employeeId = employeeIdBySalesperson.get(spId);
    const fuelEfficiency = employeeId ? fuelEfficiencyByDriverEmployeeId.get(employeeId) ?? 0 : 0;
    const estimatedFuelCost =
      tripDistanceKm > 0 && fuelEfficiency > 0 && fuelPricePerLiter > 0 ? Math.round((tripDistanceKm / fuelEfficiency) * fuelPricePerLiter * 100) / 100 : null;

    result.set(visit._id.toString(), { tripDistanceKm, estimatedFuelCost });
  }

  return result;
}
