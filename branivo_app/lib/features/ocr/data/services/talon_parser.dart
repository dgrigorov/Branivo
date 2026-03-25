import '../repositories/ocr_models.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Talon parser — extracts vehicle registration fields from raw OCR text.
// Based on EU Directive 1999/37/EC field codes (Bulgarian СРМПС / малък талон).
//
// Robustness notes:
//  • Laminated documents cause specular glare → some chars misread (Б→5, З→3,
//    Ч→Y, Р→P, Н→H). The parser compensates with OCR error tables.
//  • Field codes may be missing `(` or `.` (e.g. `V9)EURO 4`, `(F1) 2426`).
//  • Value may appear on the NEXT line when field code has nothing after it.
//  • VIN may contain an embedded space due to line-break artifacts.
//  • MRZ zone (lines with `<`) carries authoritative EGN and owner name.
// ─────────────────────────────────────────────────────────────────────────────

abstract final class TalonParser {
  static const double _highConf = 0.9;
  static const double _noConf = 0.0;
  static const double _threshold = 0.85;

  static final _plateRegex =
      RegExp(r'[А-ЯA-Z]{1,2}\d{3,4}[А-ЯA-Z]{1,2}', caseSensitive: false);
  static final _vinRegex =
      RegExp(r'[A-HJ-NPR-Z0-9]{17}', caseSensitive: false);
  static final _dateRegex = RegExp(r'\d{2}[.\-/]\d{2}[.\-/]\d{4}');
  // cert: accept Ne / No (OCR confuses e↔o)
  static final _certNumberRegex =
      RegExp(r'N[eo]\s+(\d{6,12})', caseSensitive: false);
  static final _egnRegex =
      RegExp(r'ЕГН[/\s]*(?:ID)?\s*(\d{10})', caseSensitive: false);
  static final _yearRegex = RegExp(r'\b((?:19|20)\d{2})\b');
  static final _bFieldRegex = RegExp(
    r'[({]?B[)}\s]\s*(\d{2})[.\-/](\d{2})[.\-/](\d{4})',
    caseSensitive: false,
  );
  // V.9 EURO — handles missing ( and/or missing dot: `V9)EURO 4`, `(V9)EURO 4`
  static final _euroRegex =
      RegExp(r'\(?V\.?9\)?\s*(EURO\s*\d+)', caseSensitive: false);

  // ── parse ──────────────────────────────────────────────────────────────────
  static Map<String, OcrField> parse(String text) {
    final lines = text
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    // ── (A) License plate ─────────────────────────────────────────────────────
    final lpRaw = _extractByCode(lines, 'A');
    final lpCandidate = lpRaw.value ?? lpRaw.nextLine;
    final lpMatch = lpCandidate != null
        ? _plateRegex.firstMatch(lpCandidate)?.group(0)
        : _plateRegex.firstMatch(text)?.group(0);
    final lpValue = lpMatch ?? lpCandidate?.split(RegExp(r'\s+')).first;

    // ── (E) VIN ───────────────────────────────────────────────────────────────
    // Strip embedded spaces — OCR sometimes breaks VIN across a line boundary.
    final eRaw = _extractByCode(lines, 'E');
    final vinCandidate = eRaw.value?.replaceAll(RegExp(r'\s+'), '');
    final vinFromCode = vinCandidate != null
        ? _vinRegex.firstMatch(vinCandidate)?.group(0)
        : null;
    // Fallback: search MRZ lines (space-stripped) for 17-char VIN pattern.
    final vinFromMrz = vinFromCode == null ? _vinFromMrz(lines) : null;
    final vinValue = vinFromCode ?? vinFromMrz;

    // ── Certificate number ────────────────────────────────────────────────────
    final certNumber = _certNumberRegex.firstMatch(text)?.group(1);

    // ── (D.1) Make and model ──────────────────────────────────────────────────
    final d1Raw = _extractByCode(lines, 'D.1');
    final (makeValue, modelValue) =
        _extractMakeModel(d1Raw.value, d1Raw.nextLine);

    // ── (R) Color — value may be 2+ lines below (R); normalize glare artifacts ──
    final colorValue = _extractColor(lines);

    // ── (B) First registration date ───────────────────────────────────────────
    final bMatch = _bFieldRegex.firstMatch(text);
    final firstRegDate = bMatch != null
        ? '${bMatch.group(1)}.${bMatch.group(2)}.${bMatch.group(3)}'
        : _extractByPatternGroup(
            lines,
            RegExp(r'\(B\)\s*(\d{2}[.\-/]\d{2}[.\-/]\d{4})',
                caseSensitive: false),
          );

    // ── Year ──────────────────────────────────────────────────────────────────
    final yearValue = bMatch != null
        ? bMatch.group(3)
        : _yearRegex.firstMatch(firstRegDate ?? '')?.group(1) ??
            _extractByPatternGroup(lines, _yearRegex);

    // ── Registration validity — (I) or (H) suffix: `14.09.2023(H)` ──────────
    final iRaw = _extractByCode(lines, 'I');
    final regDateValue = iRaw.value != null
        ? _dateRegex.firstMatch(iRaw.value!)?.group(0)
        : _extractByPatternGroup(
              lines,
              RegExp(r'^\(\)\s*(\d{2}[.\-/]\d{2}[.\-/]\d{4})$'),
            ) ??
            _extractByPatternGroup(
              lines,
              RegExp(r'(\d{2}[.\-/]\d{2}[.\-/]\d{4})\(H\)',
                  caseSensitive: false),
            );

    // ── (P.1) Engine volume ───────────────────────────────────────────────────
    final p1Raw = _extractByCode(lines, 'P.1');

    // ── (P.2) Power (kW) — often no space: `(P.2)200` ────────────────────────
    final p2Raw = _extractByCode(lines, 'P.2');

    // ── (P.3) Fuel type ───────────────────────────────────────────────────────
    final p3Raw = _extractByCode(lines, 'P.3');
    final fuelValue = _normalizeFuelRobust(p3Raw.value, lines);

    // ── (S.1) Seats ───────────────────────────────────────────────────────────
    final s1Raw = _extractByCode(lines, 'S.1');
    final seatsValue = s1Raw.value;

    // ── (J) Vehicle category — value on next line; strip stray `)` ───────────
    final jRaw = _extractByCode(lines, 'J');
    final categoryRaw =
        jRaw.value?.isNotEmpty == true ? jRaw.value : jRaw.nextLine;
    final categoryValue =
        categoryRaw?.replaceAll(RegExp(r'[)}\s]+$'), '').trim();

    // ── V.9 EURO standard — handles `V9)EURO 4` without `(` ─────────────────
    final euroMatch = _euroRegex.firstMatch(text);
    final euroValue = euroMatch?.group(1)?.trim();

    // ── Owner: name, address ──────────────────────────────────────────────────
    // OCR often reads `(C.2.1)` as `G21`, `(C.2.2)` as `G22.)` due to glyph
    // merging of `(C` → `G`. Try canonical codes first, then OCR fallbacks.
    final c21 = _extractByCodeWithFallback(lines, 'C.2.1', r'G2\.?1');
    final c22 = _extractByCodeWithFallback(lines, 'C.2.2', r'G2\.?2');
    final c23 = _extractByCodeWithFallback(lines, 'C.2.3', r'C2\.?3');

    final ownerName = _extractOwnerName(lines, c21, c22);
    final ownerAddress = _extractOwnerAddress(lines, c23);

    // ── EGN / personal ID ─────────────────────────────────────────────────────
    final (egnValue, egnConf) = _extractEgn(text, lines);

    return {
      'license_plate': _build(lpValue, lpValue != null ? _highConf : _noConf),
      'vin': _build(vinValue, vinValue != null ? _highConf : _noConf),
      'cert_number':
          _build(certNumber, certNumber != null ? _highConf : _noConf),
      'make': _build(makeValue, d1Raw.confidence),
      'model': _build(modelValue, d1Raw.confidence),
      'year': _build(yearValue, yearValue != null ? _highConf : _noConf),
      'color': _build(colorValue, colorValue != null ? _highConf : _noConf),
      'engine_volume': _build(p1Raw.value, p1Raw.confidence),
      'power_kw': _build(p2Raw.value, p2Raw.confidence),
      'fuel_type': _build(fuelValue, fuelValue != null ? _highConf : _noConf),
      'seats': _build(seatsValue, s1Raw.confidence),
      'vehicle_category':
          _build(categoryValue, categoryValue != null ? _highConf : _noConf),
      'euro_standard':
          _build(euroValue, euroValue != null ? _highConf : _noConf),
      'first_registration_date': _build(
        firstRegDate,
        firstRegDate != null ? _highConf : _noConf,
      ),
      'registration_validity':
          _build(regDateValue, regDateValue != null ? _highConf : _noConf),
      'owner_name': _build(
        ownerName,
        ownerName != null ? _highConf : _noConf,
      ),
      'owner_egn': _build(egnValue, egnConf),
      'owner_address':
          _build(ownerAddress, ownerAddress != null ? _highConf : _noConf),
    };
  }

  // ── VIN from MRZ zone ──────────────────────────────────────────────────────
  static String? _vinFromMrz(List<String> lines) {
    for (final line in lines.where((l) => l.contains('<'))) {
      final norm = line.replaceAll(RegExp(r'\s+'), '');
      final m = _vinRegex.firstMatch(norm);
      if (m != null) return m.group(0);
    }
    return null;
  }

  // ── EGN extraction ─────────────────────────────────────────────────────────
  // Priority 1: explicit ЕГН prefix
  // Priority 2: MRZ line (VIN 17 chars + EGN 10 digits)
  // Priority 3: standalone 10-digit line (last resort, lower confidence)
  static (String?, double) _extractEgn(String text, List<String> lines) {
    final direct = _egnRegex.firstMatch(text)?.group(1);
    if (direct != null) return (direct, _highConf);

    // MRZ: strip spaces, look for 17-char VIN immediately followed by 10 digits
    for (final line in lines.where((l) => l.contains('<'))) {
      final norm = line.replaceAll(RegExp(r'\s+'), '');
      final m = RegExp(r'[A-HJ-NPR-Z0-9]{17}(\d{10})', caseSensitive: false)
          .firstMatch(norm);
      if (m != null) return (m.group(1), 0.85);
    }

    // Standalone 10-digit line (appears after MRZ block in some scans)
    for (final line in lines) {
      if (RegExp(r'^\d{10}$').hasMatch(line)) return (line, 0.75);
    }

    return (null, _noConf);
  }

  // ── Owner name extraction ──────────────────────────────────────────────────
  // Priority 1: MRZ name line SURNAME<<GIVEN<NAME<<<<
  // Priority 2: C.2.1 / C.2.2 structured fields
  static String? _extractOwnerName(
    List<String> lines,
    ({String? value, double confidence, String? nextLine}) c21,
    ({String? value, double confidence, String? nextLine}) c22,
  ) {
    // MRZ name line: SURNAME<<GIVEN<SECOND<<<<
    for (final line in lines.where((l) => l.contains('<<'))) {
      final norm = line.replaceAll(RegExp(r'\s+'), '');
      if (!RegExp(r'^[A-Z<]+$').hasMatch(norm)) continue;
      final parts = norm.split('<<');
      if (parts.length < 2) continue;
      final surname = parts[0].replaceAll('<', ' ').trim();
      final given =
          parts[1].split('<').where((p) => p.isNotEmpty).join(' ').trim();
      if (surname.length >= 3 && given.isNotEmpty) {
        return '$surname $given';
      }
    }

    // Structured fields (C.2.1 / C.2.2)
    final surname = c21.nextLine ??
        RegExp(r'[A-Z][A-Za-z]+').firstMatch(c21.value ?? '')?.group(0);
    final given = c22.nextLine?.trim() ??
        RegExp(r'[A-Z][A-Za-z\s]+')
            .firstMatch(c22.value ?? '')
            ?.group(0)
            ?.trim();

    if (surname != null && given != null) return '$surname $given'.trim();
    final combined = '${c21.value ?? ''} ${c22.value ?? ''}'.trim();
    return combined.isNotEmpty ? combined : null;
  }

  // ── Owner address extraction ───────────────────────────────────────────────
  // Prefer Latin transliteration lines (more reliable than Cyrillic OCR).
  static String? _extractOwnerAddress(
    List<String> lines,
    ({String? value, double confidence, String? nextLine}) c23,
  ) {
    // Look for Latin address lines containing Obl./Oblast/ZHK/obsht.
    final latinAddr = <String>[];
    for (final line in lines) {
      if (RegExp(r'\b(Obl|Oblast|obsht|ZHK|GR|DLIN|dlin)\b',
              caseSensitive: false)
          .hasMatch(line)) {
        latinAddr.add(line);
      }
    }
    if (latinAddr.isNotEmpty) return latinAddr.join(', ');

    // Fallback: C.2.3 value
    return c23.value?.isNotEmpty == true ? c23.value : c23.nextLine;
  }

  // ── Fuel normalization — handles OCR glare artifacts ──────────────────────
  // Laminated talons cause:  Б→5, З→3, Ч→Y, common Latin/Cyrillic swap.
  static String? _normalizeFuelRobust(
      String? rawValue, List<String> lines) {
    // 1. Standalone (PETROL) or (DIESEL) line — most reliable
    for (final line in lines) {
      final u = line.toUpperCase();
      if (RegExp(r'^\(PETROL\)$').hasMatch(u)) return 'Бензин';
      if (RegExp(r'^\(DIESEL\)$').hasMatch(u)) return 'Дизел';
      if (RegExp(r'^\(LPG\)$').hasMatch(u)) return 'Газ (LPG)';
    }

    if (rawValue == null || rawValue.isEmpty) return null;
    final u = rawValue.toUpperCase();

    // 2. Exact / near-exact Cyrillic/Latin matches
    if (u.contains('БЕНЗИН') || u.contains('PETROL') || u.contains('BENZIN')) {
      return 'Бензин';
    }
    if (u.contains('ДИЗЕЛ') || u.contains('DIESEL')) { return 'Дизел'; }
    if (u.contains('ГАЗ') || u.contains('LPG')) { return 'Газ (LPG)'; }
    if (u.contains('ЕЛЕКТР') || u.contains('ELECTR')) { return 'Електрически'; }
    if (u.contains('ХИБРИД') || u.contains('HYBRID')) { return 'Хибрид'; }

    // 3. OCR glare artifacts: Б→5, З→3 (e.g. "5ЕН3МН" → "БЕНЗИН")
    final normalized = u
        .replaceAll('5', 'Б')
        .replaceAll('3', 'З');
    if (normalized.contains('БЕНЗИН') || normalized.contains('БЕНЗ')) {
      return 'Бензин';
    }
    if (normalized.contains('ДИЗЕЛ')) { return 'Дизел'; }

    return rawValue;
  }

  // ── Color normalization — handles OCR Cyrillic/Latin confusion ──────────
  // Laminate glare: Ч→Y, Р→P, Н→H, Е→E (ЧЕРЕН → YEPEH)
  static String _normalizeColor(String raw) {
    final u = raw.toUpperCase();

    // Latin OCR artifacts for Cyrillic color words
    const latinToCyrillic = <String, String>{
      'YEPEH': 'ЧЕРЕН',
      'BEЛB': 'БЯЛО',
      'CИHB': 'СИНЬО',
      'ЧEPEH': 'ЧЕРЕН',
      'BЯЛО': 'БЯЛО',
    };
    if (latinToCyrillic.containsKey(u)) return latinToCyrillic[u]!;

    // Known colors in either script
    if (u == 'BLACK' || u.contains('ЧЕРЕН') || u.contains('YEPEH')) {
      return 'Черен';
    }
    if (u == 'WHITE' || u.contains('БЯЛ') || u.contains('БЯЛО')) {
      return 'Бял';
    }
    if (u == 'SILVER' || u.contains('СРЕБРИСТ')) return 'Сребрист';
    if (u == 'GREY' || u == 'GRAY' || u.contains('СИВ')) return 'Сив';
    if (u == 'RED' || u.contains('ЧЕРВЕН')) return 'Червен';
    if (u == 'BLUE' || u.contains('СИН')) return 'Син';
    if (u == 'GREEN' || u.contains('ЗЕЛЕН')) return 'Зелен';
    if (u == 'BROWN' || u.contains('КАФЯВ')) return 'Кафяв';

    return raw;
  }

  // ── _extractColor ──────────────────────────────────────────────────────────
  // Scans up to 5 lines after `(R)` for a recognizable color token.
  // Needed because `(R)` is often alone and the next line is another code.
  static String? _extractColor(List<String> lines) {
    for (int i = 0; i < lines.length; i++) {
      if (!RegExp(r'^\(R\)$', caseSensitive: false).hasMatch(lines[i])) {
        continue;
      }
      // Found (R) line — scan the next 5 lines for a color word.
      for (int j = i + 1; j <= i + 5 && j < lines.length; j++) {
        final candidate = lines[j].trim();
        // Skip other field codes
        if (RegExp(r'^\([A-Z]').hasMatch(candidate)) continue;
        if (candidate.isEmpty) continue;
        final normalized = _normalizeColor(candidate.split(RegExp(r'\s+')).first);
        // Return only if normalization changed the value (recognized) or it's a
        // known literal.
        if (normalized != candidate.split(RegExp(r'\s+')).first ||
            RegExp(r'^(BLACK|WHITE|SILVER|GREY|GRAY|RED|BLUE|GREEN|BROWN)$',
                    caseSensitive: false)
                .hasMatch(candidate.split(RegExp(r'\s+')).first)) {
          return normalized;
        }
        // Check if first token looks like a color word (Cyrillic or Latin, 3+ chars)
        final first = candidate.split(RegExp(r'\s+')).first;
        if (first.length >= 3 &&
            RegExp(r'^[A-ZА-Яа-яa-z]+$').hasMatch(first)) {
          return _normalizeColor(first);
        }
      }
    }
    // Fallback: also accept inline value or next line from _extractByCode
    final raw = _extractByCode(lines, 'R');
    final candidate = raw.value?.isNotEmpty == true ? raw.value : raw.nextLine;
    return candidate != null
        ? _normalizeColor(candidate.split(RegExp(r'\s+')).first)
        : null;
  }

  // ── _extractByCodeWithFallback ─────────────────────────────────────────────
  // Tries the canonical code first; if not found, tries the OCR-mangled pattern.
  static ({String? value, double confidence, String? nextLine})
      _extractByCodeWithFallback(
    List<String> lines,
    String code,
    String ocrFallbackPattern,
  ) {
    final canonical = _extractByCode(lines, code);
    if (canonical.value != null || canonical.nextLine != null) return canonical;

    // OCR fallback: look for the mangled code at start of line
    final re = RegExp(
      '(?:$ocrFallbackPattern)\\.?\\)?\\**\\s*(.*)',
      caseSensitive: false,
    );
    for (int i = 0; i < lines.length; i++) {
      final m = re.firstMatch(lines[i]);
      if (m == null) continue;
      final val = m
          .group(1)!
          .split(RegExp(r'\s{2,}|\t'))
          .first
          .replaceAll(RegExp(r'\*+'), '')
          .replaceAll(RegExp(r'[)}\s]+$'), '')
          .trim();
      final nextRaw = i + 1 < lines.length ? lines[i + 1] : null;
      final nextLine = (nextRaw != null &&
              !nextRaw.startsWith('(') &&
              !RegExp(r'^[A-Z]\d').hasMatch(nextRaw))
          ? nextRaw.replaceAll(RegExp(r'\*+'), '').trim()
          : null;
      final cleanNext = (nextLine?.isEmpty ?? true) ? null : nextLine;
      if (val.isNotEmpty) {
        return (value: val, confidence: _highConf, nextLine: cleanNext);
      }
      if (cleanNext != null) {
        return (value: null, confidence: _noConf, nextLine: cleanNext);
      }
    }
    return (value: null, confidence: _noConf, nextLine: null);
  }

  // ── _extractByCode ─────────────────────────────────────────────────────────
  // Finds `(CODE)` on a line and returns the rest of that line as value,
  // plus the NEXT line as a continuation (used when value is on the next line).
  // When the inline value is empty, nextLine is still returned so callers can
  // use it as a fallback (e.g. `(R)` alone with `ЧЕРЕН` on the next line).
  static ({String? value, double confidence, String? nextLine}) _extractByCode(
    List<String> lines,
    String code,
  ) {
    final escaped = code.replaceAll('.', r'\.');
    final re = RegExp('\\($escaped\\)\\**\\s*(.*)', caseSensitive: false);

    for (int i = 0; i < lines.length; i++) {
      final m = re.firstMatch(lines[i]);
      if (m == null) continue;

      final val = m
          .group(1)!
          .split(RegExp(r'\s{2,}|\t|\s+\([A-Z]|\s+N[oe]\b'))
          .first
          .replaceAll(RegExp(r'\*+'), '')
          .trim();

      final nextRaw = i + 1 < lines.length ? lines[i + 1] : null;
      final nextLine = (nextRaw != null &&
              !nextRaw.startsWith('(') &&
              !nextRaw.startsWith('N'))
          ? nextRaw.replaceAll(RegExp(r'\*+'), '').trim()
          : null;
      final cleanNext = (nextLine?.isEmpty ?? true) ? null : nextLine;

      if (val.isNotEmpty) {
        return (value: val, confidence: _highConf, nextLine: cleanNext);
      }
      // val is empty — return nextLine as fallback (e.g. (R) → ЧЕРЕН next line)
      if (cleanNext != null) {
        return (value: null, confidence: _noConf, nextLine: cleanNext);
      }
    }
    return (value: null, confidence: _noConf, nextLine: null);
  }

  static String? _extractByPatternGroup(List<String> lines, RegExp pattern) {
    for (final line in lines) {
      final m = pattern.firstMatch(line);
      if (m != null) return m.group(1)?.trim();
    }
    return null;
  }

  static (String?, String?) _extractMakeModel(
      String? d1Value, String? nextLine) {
    final candidate = nextLine ?? d1Value ?? '';
    if (candidate.isEmpty) return (null, null);

    final latinMatch =
        RegExp(r'([A-Z][A-Z-]{1,20})\s+([A-Z0-9][A-Z0-9\s-]{1,15})')
            .firstMatch(candidate);
    if (latinMatch != null) {
      return (latinMatch.group(1)?.trim(), latinMatch.group(2)?.trim());
    }
    if (d1Value != null) {
      final first = d1Value.split(RegExp(r'\s+')).first;
      return (first.isEmpty ? null : first, null);
    }
    return (null, null);
  }

  static OcrField _build(String? value, double confidence) {
    final v = (value?.isEmpty ?? true) ? null : value;
    return OcrField(
      value: v,
      confidence: v != null ? confidence : _noConf,
      autoFilled: v != null && confidence >= _threshold,
    );
  }

  // For use in tests — exposes the field-code extractor directly.
  static Map<String, String> extractFields(String text) {
    final lines = text
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();
    final result = <String, String>{};
    for (final code in [
      'A', 'E', 'B', 'I', 'D.1', 'R', 'P.1', 'P.2', 'P.3',
      'S.1', 'J', 'C.2.1', 'C.2.2', 'C.2.3',
    ]) {
      final extracted = _extractByCode(lines, code);
      final v = extracted.value ?? extracted.nextLine;
      if (v != null) result[code] = v;
    }
    return result;
  }
}
