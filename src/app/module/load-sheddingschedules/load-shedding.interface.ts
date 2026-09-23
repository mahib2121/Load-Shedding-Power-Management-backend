export interface ICreateSchedulePayload {
  name: string;
  date: Date;
  expectedDemandMW: number;
  availableSupplyMW: number;
  zoneId: string;
}
