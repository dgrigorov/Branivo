import 'package:flutter/material.dart';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const Color kOcrBg = Color(0xFF0A0A0A);
const Color kOcrSurface = Color(0xFF1A1A2E);
const Color kOcrIndigo = Color(0xFF6366F1);
const Color kOcrBlue = Color(0xFF60A5FA);
const Color kOcrGreen = Color(0xFF10B981);
const Color kOcrMuted = Color(0xFF64748B);
const Color kOcrTextSub = Color(0xFF94A3B8);
const int kTotalSteps = 3;

// ─── Step metadata — ORDER: 0=MRZ/owner, 1=vehicle identity, 2=tech specs ─────
const List<String> kStepTitles = [
  'Лични данни',
  'Данните на МПС-то',
  'Специфики на МПС-то',
];

const List<String> kStepSubs = [
  'Снимайте страницата на собственика — MRZ зона, ЕГН, адрес',
  'Снимайте предната страна — рег. №, VIN, марка, цвят',
  'Снимайте задната страна — категория, дати, обем, гориво, EURO',
];

// ─── Talon field legends per step ──────────────────────────────────────────────
const List<(String, String)> kLegendStep0 = [
  ('E', 'VIN / Рамен №'),
  ('A', 'Рег. номер'),
  ('C.2.1', 'Фамилия'),
  ('C.2.2', 'Собствено'),
  ('C.2.3', 'Адрес'),
  ('EGN', 'ЕГН / ЛНЧ'),
];

const List<(String, String)> kLegendStep1 = [
  ('A', 'Рег. номер'),
  ('E', 'Рама / VIN'),
  ('D.1', 'Марка и модел'),
  ('R', 'Цвят'),
  ('No', 'Номер на талона'),
  ('D', 'Категория МПС'),
];

const List<(String, String)> kLegendStep2 = [
  ('J', 'Категория (M1)'),
  ('B', '1-ва регистрация'),
  ('I', 'Дата на валидност'),
  ('P.1', 'Обем (cc)'),
  ('P.2', 'Мощност (kW)'),
  ('P.3', 'Гориво'),
  ('S.1', 'Места'),
  ('V.9', 'Евро стандарт'),
];

List<(String, String)> kLegendFor(int step) => switch (step) {
      0 => kLegendStep0,
      1 => kLegendStep1,
      _ => kLegendStep2,
    };

// ─── Parsed field labels ────────────────────────────────────────────────────────
const Map<String, String> kFieldLabels = {
  'license_plate': 'Рег. №',
  'vin': 'VIN / Рамен номер',
  'cert_number': 'Номер на талона',
  'make': 'Марка',
  'model': 'Модел',
  'year': 'Година',
  'color': 'Цвят',
  'engine_volume': 'Обем (cc)',
  'power_kw': 'Мощност (kW)',
  'fuel_type': 'Гориво',
  'seats': 'Брой места',
  'vehicle_category': 'Категория МПС',
  'euro_standard': 'Евро стандарт',
  'first_registration_date': 'Първа регистрация',
  'registration_validity': 'Валидност',
  'owner_name': 'Собственик',
  'owner_egn': 'ЕГН / ЛНЧ',
  'owner_address': 'Адрес',
};
