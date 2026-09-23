export interface ICreateSchedulePayload {
  name: string;
  date: Date;
  expectedDemandMW: number;
  availableSupplyMW: number;
  zoneId: string;
}
export interface ICreateScheduleSlotPayload {
  feederId: string;
  startTime: Date;
  endTime: Date;
  durationHours: number;
  plannedLoadReductionMW: number;
}
