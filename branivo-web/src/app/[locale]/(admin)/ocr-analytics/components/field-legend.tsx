'use client';

import { useState } from 'react';

interface LegendEntry {
  code: string;
  bg: string;
  en: string;
}

const PART_I_LEFT: LegendEntry[] = [
  { code: 'A', bg: 'Регистрационен номер на МПС', en: 'Registration number' },
  { code: 'E', bg: 'Идентификационен номер (VIN / номер на рамата)', en: 'VIN / Chassis number' },
  { code: 'D', bg: 'Категория / вид на МПС', en: 'Vehicle category / type' },
  { code: 'D.1', bg: 'Марка / търговско наименование', en: 'Make / trade name' },
  { code: 'D.2', bg: 'Тип на МПС', en: 'Vehicle type' },
  { code: 'D.3', bg: 'Вариант / версия', en: 'Variant / version' },
  { code: 'K', bg: 'Номер на типово одобрение', en: 'Type approval number' },
  { code: 'R', bg: 'Цвят на МПС', en: 'Colour of vehicle' },
  { code: 'Δ', bg: 'Страна на регистрация', en: 'Country of registration' },
  { code: 'No', bg: 'Номер на свидетелство за регистрация', en: 'Certificate number' },
];

const PART_I_RIGHT: LegendEntry[] = [
  { code: 'J', bg: 'Категория МПС (по ЕС)', en: 'EU vehicle category (M1, N1, etc.)' },
  { code: 'B', bg: 'Дата на първа регистрация', en: 'Date of first registration' },
  { code: 'I', bg: 'Дата на регистрация по свидетелството', en: 'Date of registration' },
  { code: 'H', bg: 'Срок на валидност на регистрацията', en: 'Validity of the registration' },
  { code: 'G', bg: 'Маса на МПС в готовност за движение (кг)', en: 'Mass in running order (kg)' },
  { code: 'F.1', bg: 'Техн. допустима макс. маса (кг)', en: 'Technically permissible max laden mass (kg)' },
  { code: 'F.2', bg: 'Допустима макс. маса на рег. МПС (кг)', en: 'Permissible max laden mass in service (kg)' },
  { code: 'F.3', bg: 'Техн. допустима макс. маса на ремарке (кг)', en: 'Max permissible mass of trailer (kg)' },
  { code: 'O.1', bg: 'Макс. маса на ремарке със спирачки (кг)', en: 'Max mass of braked trailer (kg)' },
  { code: 'O.2', bg: 'Макс. маса на ремарке без спирачки (кг)', en: 'Max mass of unbraked trailer (kg)' },
  { code: 'L', bg: 'Брой оси', en: 'Number of axles' },
  { code: 'M', bg: 'Разстояние между осите (мм)', en: 'Wheelbase (mm)' },
  { code: 'N.1–N.5', bg: 'Маси върху всяка ос (кг)', en: 'Mass on each axle (kg)' },
  { code: 'Q', bg: 'Отношение мощност/маса (кВт/кг)', en: 'Power-to-weight ratio (kW/kg)' },
  { code: 'P.1', bg: 'Работен обем на двигателя (куб.см)', en: 'Engine displacement (cc)' },
  { code: 'P.2', bg: 'Максимална нетна мощност (kW)', en: 'Maximum net power (kW)' },
  { code: 'P.3', bg: 'Вид гориво / енергиен източник', en: 'Fuel / energy source' },
  { code: 'S.1', bg: 'Брой места (включително шофьора)', en: 'Number of seats (incl. driver)' },
  { code: 'S.2', bg: 'Брой стоящи места', en: 'Number of standing places' },
  { code: 'U.1', bg: 'Ниво на шума при стационарен режим (dB)', en: 'Stationary noise level (dB)' },
  { code: 'U.2', bg: 'Обороти при измерване на шума (об./мин)', en: 'Engine speed for noise test (rpm)' },
  { code: 'V.1–V.8', bg: 'Данни за емисии (CO₂, HC, NOx, PM, л/100км и др.)', en: 'Emission data (CO₂, HC, NOx, PM, fuel consumption, etc.)' },
  { code: 'V.9', bg: 'Екологична категория (Euro 4, Euro 6 и др.)', en: 'Emission category (Euro standard)' },
];

const PART_II: LegendEntry[] = [
  { code: 'C.2.1.', bg: 'Фамилно и собствено/бащино на собственика', en: 'Surname and first name(s) of owner' },
  { code: 'C.2.2.', bg: 'Собствено и бащино / пълно наименование', en: 'First name / full name of owner' },
  { code: 'C.2.3.', bg: 'Адрес на собственика', en: 'Address of owner' },
  { code: 'ЕГН / ID', bg: 'ЕГН или национален идентификационен номер', en: 'Personal ID / national identification number' },
];

interface SectionProps {
  title: string;
  entries: LegendEntry[];
}

function LegendSection({ title, entries }: SectionProps) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 border-b border-gray-200 pb-1">
        {title}
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-2 py-1 font-semibold text-gray-500 w-[72px] border border-gray-200">Код</th>
            <th className="text-left px-2 py-1 font-semibold text-gray-500 border border-gray-200">Значение (БГ)</th>
            <th className="text-left px-2 py-1 font-semibold text-gray-500 border border-gray-200 hidden sm:table-cell">Description (EN)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.code} className="even:bg-gray-50 hover:bg-blue-50 transition-colors">
              <td className="px-2 py-1 font-mono font-bold text-blue-700 border border-gray-200 whitespace-nowrap">
                ({e.code})
              </td>
              <td className="px-2 py-1 text-gray-800 border border-gray-200">{e.bg}</td>
              <td className="px-2 py-1 text-gray-500 italic border border-gray-200 hidden sm:table-cell">{e.en}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FieldLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
      >
        <span>📋 Легенда на полетата — EU стандартни кодове на свидетелство за регистрация</span>
        <span className="text-gray-400 text-xs">{open ? '▲ Скрий' : '▼ Покажи'}</span>
      </button>

      {open && (
        <div className="p-5 bg-white space-y-6">
          <LegendSection title="Ч.I — Лява страница (идентификация)" entries={PART_I_LEFT} />
          <LegendSection title="Ч.I — Дясна страница (технически данни)" entries={PART_I_RIGHT} />
          <LegendSection title="Ч.II — Собственик" entries={PART_II} />
          <p className="text-[11px] text-gray-400 border-t pt-2">
            Кодовете са стандартизирани в Директива 1999/37/ЕО (изменена с 2003/127/ЕО) и са еднакви за всички
            свидетелства за регистрация в Европейския съюз.
          </p>
        </div>
      )}
    </div>
  );
}
