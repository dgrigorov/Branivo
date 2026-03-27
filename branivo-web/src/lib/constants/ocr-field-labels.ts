const OCR_FIELD_LABELS: Record<string, string> = {
  license_plate: 'Регистрационен номер (A)',
  vin: 'VIN (E)',
  cert_number: 'Номер на свидетелство',
  make: 'Марка (D.1)',
  model: 'Модел (D.3)',
  year: 'Година',
  color: 'Цвят (R)',
  engine_volume: 'Обем на двигател (P.1)',
  fuel_type: 'Гориво (P.3)',
  first_registration_date: 'Първа регистрация (B)',
  owner_name: 'Собственик',
  owner_egn: 'ЕГН',
  owner_address: 'Адрес',
};

export function getFieldLabel(fieldName: string): string {
  return OCR_FIELD_LABELS[fieldName] ?? fieldName;
}
