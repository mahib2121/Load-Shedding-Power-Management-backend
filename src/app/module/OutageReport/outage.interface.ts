export interface ICreateOutageReportPayload {
  description?: string;
  latitude?: number;
  longitude?: number;
}

export interface IOutageListFilters {
  status?:
    | "REPORTED"
    | "VERIFIED"
    | "ASSIGNED"
    | "IN_PROGRESS"
    | "RESTORED";
}