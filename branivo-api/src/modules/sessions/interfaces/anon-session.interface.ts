export interface VehicleFormData {
  reg_number?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  owner_name?: string;
}

export interface AnonSessionData {
  session_id: string;
  tenant_id: string;
  created_at: string; // ISO 8601
  vehicle_data?: VehicleFormData;
  selected_quote_id?: string;
}
